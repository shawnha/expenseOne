/**
 * 작성 중 폼 레지스트리 단위 테스트.
 * 실행: npm run test:unit
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FORM_ACTIVITY_EVENTS,
  FORM_BUSY_MAX_AGE_MS,
  IDLE_GRACE_MS,
  RELOAD_CANCELLED_MS,
  createReloadGate,
  isAnyFormBusy,
  msUntilFormBusyExpires,
  setFormBusy,
  subscribe,
  trackFormActivity,
} from "./form-busy";

const T0 = 1_800_000_000_000;
const IDS = ["deposit-request", "corporate-card", "refund", "expense-edit"];
const unsubs: Array<() => void> = [];

function listen(): { calls: number; stop: () => void } {
  const counter = { calls: 0, stop: () => {} };
  counter.stop = subscribe(() => {
    counter.calls += 1;
  });
  unsubs.push(counter.stop);
  return counter;
}

afterEach(() => {
  for (const u of unsubs.splice(0)) u();
  for (const id of IDS) setFormBusy(id, false, T0);
});

describe("form-busy", () => {
  it("처음엔 작성 중인 폼이 없다", () => {
    assert.equal(isAnyFormBusy(T0), false);
    assert.equal(msUntilFormBusyExpires(T0), null);
  });

  it("busy를 켜면 작성 중이 되고, 끄면 풀린다 — 전체 상태가 바뀔 때만 알린다", () => {
    const l = listen();
    setFormBusy("deposit-request", true, T0);
    assert.equal(isAnyFormBusy(T0), true);
    assert.equal(l.calls, 1);

    // 같은 상태로 다시 켜도 알리지 않는다
    setFormBusy("deposit-request", true, T0 + 1000);
    assert.equal(l.calls, 1);

    setFormBusy("deposit-request", false, T0 + 2000);
    assert.equal(isAnyFormBusy(T0 + 2000), false);
    assert.equal(l.calls, 2);
  });

  it("없는 폼을 끄는 건 아무 일도 없다", () => {
    const l = listen();
    setFormBusy("refund", false, T0);
    assert.equal(isAnyFormBusy(T0), false);
    assert.equal(l.calls, 0);
  });

  it("폼 여러 개: 하나라도 작성 중이면 busy, 마지막 것이 꺼질 때 한 번 알린다", () => {
    const l = listen();
    setFormBusy("deposit-request", true, T0);
    setFormBusy("corporate-card", true, T0);
    assert.equal(l.calls, 1);

    setFormBusy("deposit-request", false, T0);
    assert.equal(isAnyFormBusy(T0), true);
    assert.equal(l.calls, 1);

    setFormBusy("corporate-card", false, T0);
    assert.equal(isAnyFormBusy(T0), false);
    assert.equal(l.calls, 2);
  });

  it("마지막으로 켠 뒤 30분이 지나면 만료로 본다 (갇힘 방지)", () => {
    setFormBusy("deposit-request", true, T0);
    assert.equal(isAnyFormBusy(T0 + FORM_BUSY_MAX_AGE_MS - 1), true);
    assert.equal(isAnyFormBusy(T0 + FORM_BUSY_MAX_AGE_MS), false);
  });

  it("다시 켜면 만료 시계가 새로 시작된다", () => {
    setFormBusy("expense-edit", true, T0);
    setFormBusy("expense-edit", true, T0 + 20 * 60 * 1000);
    assert.equal(isAnyFormBusy(T0 + 40 * 60 * 1000), true);
    assert.equal(isAnyFormBusy(T0 + 50 * 60 * 1000), false);
  });

  it("기기 시계가 30분 넘게 뒤로 가도 만료로 본다", () => {
    setFormBusy("refund", true, T0);
    assert.equal(isAnyFormBusy(T0 - 10 * 60 * 1000), true);
    assert.equal(isAnyFormBusy(T0 - FORM_BUSY_MAX_AGE_MS), false);
  });

  it("msUntilFormBusyExpires는 가장 늦게 만료되는 폼 기준으로 남은 시간을 준다", () => {
    setFormBusy("deposit-request", true, T0);
    setFormBusy("corporate-card", true, T0 + 5 * 60 * 1000);
    assert.equal(msUntilFormBusyExpires(T0 + 10 * 60 * 1000), 25 * 60 * 1000);
    // 첫 폼만 만료된 시점
    assert.equal(msUntilFormBusyExpires(T0 + FORM_BUSY_MAX_AGE_MS), 5 * 60 * 1000);
    assert.equal(msUntilFormBusyExpires(T0 + FORM_BUSY_MAX_AGE_MS + 5 * 60 * 1000), null);
  });

  it("구독을 해제하면 더는 불리지 않는다", () => {
    const l = listen();
    l.stop();
    setFormBusy("refund", true, T0);
    assert.equal(l.calls, 0);
  });

  it("구독자 하나가 던져도 다른 구독자는 불린다", () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      unsubs.push(
        subscribe(() => {
          throw new Error("boom");
        }),
      );
      const l = listen();
      setFormBusy("corporate-card", true, T0);
      assert.equal(l.calls, 1);
    } finally {
      console.error = originalError;
    }
  });
});

/** 가짜 시계·타이머로 게이트를 만든다. */
function makeGate(start = T0) {
  const state = {
    now: start,
    reloads: 0,
    notices: 0,
    timers: new Map<number, { at: number; fn: () => void }>(),
  };
  let seq = 0;
  const gate = createReloadGate({
    reload: () => {
      state.reloads += 1;
    },
    notifyPending: () => {
      state.notices += 1;
    },
    now: () => state.now,
    setTimer: (fn, ms) => {
      seq += 1;
      state.timers.set(seq, { at: state.now + ms, fn });
      return seq as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (h) => {
      state.timers.delete(h as unknown as number);
    },
  });
  /** 시계를 옮기고 그때까지 만기된 타이머를 실행한다. */
  const advance = (ms: number) => {
    state.now += ms;
    for (const [id, t] of [...state.timers]) {
      if (t.at <= state.now) {
        state.timers.delete(id);
        t.fn();
      }
    }
  };
  unsubs.push(gate.dispose);
  return { gate, state, advance };
}

describe("createReloadGate — controllerchange 새로고침 판단", () => {
  it("작성 중인 폼이 없으면 예전처럼 곧바로 새로고침 (안내 없음)", () => {
    const { gate, state } = makeGate();
    gate.request();
    assert.equal(state.reloads, 1);
    assert.equal(state.notices, 0);
  });

  it("controllerchange가 여러 번 와도 새로고침은 한 번", () => {
    const { gate, state } = makeGate();
    gate.request();
    gate.request();
    assert.equal(state.reloads, 1);
  });

  it("사용자가 직접 업데이트를 눌렀으면(force) 작성 중이어도 곧바로", () => {
    setFormBusy("deposit-request", true, T0);
    const { gate, state } = makeGate();
    gate.request(true);
    assert.equal(state.reloads, 1);
    assert.equal(state.notices, 0);
  });

  it("작성 중이면 미루고 안내를 한 번만 띄운다 — busy가 풀리면 유예 뒤 새로고침", () => {
    setFormBusy("deposit-request", true, T0);
    const { gate, state, advance } = makeGate();
    gate.request();
    gate.request();
    assert.equal(state.reloads, 0);
    assert.equal(state.notices, 1);

    setFormBusy("deposit-request", false, T0 + 1000); // 다른 화면으로 이동(언마운트)
    assert.equal(state.reloads, 0, "React 커밋 도중 동기 새로고침하지 않는다");

    advance(IDLE_GRACE_MS);
    assert.equal(state.reloads, 1);
  });

  it("busy가 잠깐 풀렸다 다시 켜지면 새로고침하지 않는다 (첨부 지웠다 다시 붙이기)", () => {
    setFormBusy("corporate-card", true, T0);
    const { gate, state, advance } = makeGate();
    gate.request();

    setFormBusy("corporate-card", false, T0 + 1000); // 사진을 지운 순간
    advance(1_000);
    setFormBusy("corporate-card", true, T0 + 2000); // 다시 찍어 붙임
    advance(IDLE_GRACE_MS);
    assert.equal(state.reloads, 0, "유예 안에 다시 작성 중이 되면 미룬 상태를 지킨다");

    setFormBusy("corporate-card", false, T0 + 10_000); // 제출 후 이동
    advance(IDLE_GRACE_MS);
    assert.equal(state.reloads, 1);
  });

  it("새로고침이 취소돼도(beforeunload '머무르기') 다음 기회에 다시 시도한다", () => {
    setFormBusy("refund", true, T0);
    const { gate, state, advance } = makeGate();
    gate.request();

    // 30분 무입력 상한 → 새로고침 시도. 폼이 아직 dirty라 사용자가 "머무르기"를 골라 취소됐다.
    advance(FORM_BUSY_MAX_AGE_MS + 1_000);
    advance(IDLE_GRACE_MS);
    assert.equal(state.reloads, 1);

    // 취소 판정 시간이 지나면 잠금이 풀린다 — 구독은 살아 있어야 한다.
    advance(RELOAD_CANCELLED_MS);
    setFormBusy("refund", true, state.now);
    setFormBusy("refund", false, state.now); // 작성을 마치고 이동
    advance(IDLE_GRACE_MS);
    assert.equal(state.reloads, 2, "미뤄둔 새로고침이 영영 사라지면 옛 청크에 갇힌다");
  });

  it("busy가 안 풀려도 30분 상한이 지나면 새로고침한다 (옛 청크에 갇히지 않음)", () => {
    setFormBusy("corporate-card", true, T0);
    const { gate, state, advance } = makeGate(T0 + 10 * 60 * 1000);
    gate.request();
    assert.equal(state.reloads, 0);

    advance(19 * 60 * 1000); // 켠 지 29분
    assert.equal(state.reloads, 0);

    advance(2 * 60 * 1000); // 켠 지 31분
    advance(IDLE_GRACE_MS);
    assert.equal(state.reloads, 1);
  });

  it("dispose하면 구독·타이머가 풀려 뒤늦게 새로고침하지 않는다", () => {
    setFormBusy("refund", true, T0);
    const { gate, state, advance } = makeGate();
    gate.request();
    gate.dispose();
    assert.equal(state.timers.size, 0);

    setFormBusy("refund", false, T0);
    advance(FORM_BUSY_MAX_AGE_MS * 2);
    assert.equal(state.reloads, 0);
  });
});

/** addEventListener/removeEventListener만 흉내 내는 가짜 window. */
function fakeTarget() {
  const handlers = new Map<string, Set<() => void>>();
  return {
    get size() {
      let n = 0;
      for (const set of handlers.values()) n += set.size;
      return n;
    },
    addEventListener(type: string, handler: () => void) {
      const set = handlers.get(type) ?? new Set<() => void>();
      set.add(handler);
      handlers.set(type, set);
    },
    removeEventListener(type: string, handler: () => void) {
      handlers.get(type)?.delete(handler);
    },
    fire(type: string) {
      for (const h of [...(handlers.get(type) ?? [])]) h();
    },
  };
}

describe("trackFormActivity — 30분 상한은 '무입력' 기준이다", () => {
  it("입력이 있을 때마다 만료 시계가 다시 시작된다 (계속 쓰는 사람은 안 날아간다)", () => {
    let clock = T0;
    const target = fakeTarget();
    setFormBusy("deposit-request", true, clock);
    const stop = trackFormActivity("deposit-request", target, () => clock);
    unsubs.push(stop);

    // 25분째 계속 입력 중
    clock = T0 + 25 * 60 * 1000;
    target.fire("input");
    // 입력이 없었다면 여기서 만료였다
    assert.equal(isAnyFormBusy(T0 + FORM_BUSY_MAX_AGE_MS + 1000), true);
    // 마지막 입력 뒤 30분이 지나면 그때 만료된다
    assert.equal(isAnyFormBusy(clock + FORM_BUSY_MAX_AGE_MS), false);
  });

  it("듣는 이벤트를 모두 등록하고 정리하면 모두 뗀다", () => {
    const target = fakeTarget();
    const stop = trackFormActivity("corporate-card", target);
    assert.equal(target.size, FORM_ACTIVITY_EVENTS.length);
    stop();
    assert.equal(target.size, 0);
  });

  it("이벤트가 오면 그 폼을 작성 중으로 이어 기록한다 (훅이 busy일 때만 붙이는 이유)", () => {
    // 이 함수는 이벤트가 오면 무조건 busy로 기록한다 — useFormBusy가 busy일 때만 붙인다.
    const target = fakeTarget();
    const stop = trackFormActivity("expense-edit", target, () => T0);
    unsubs.push(stop);
    target.fire("pointerdown");
    assert.equal(isAnyFormBusy(T0), true);
  });
});
