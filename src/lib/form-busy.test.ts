/**
 * 작성 중 폼 레지스트리 단위 테스트.
 * 실행: npm run test:unit
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FORM_BUSY_MAX_AGE_MS,
  createReloadGate,
  isAnyFormBusy,
  msUntilFormBusyExpires,
  setFormBusy,
  subscribe,
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

  it("작성 중이면 미루고 안내를 한 번만 띄운다 — busy가 풀리는 순간 새로고침", () => {
    setFormBusy("deposit-request", true, T0);
    const { gate, state } = makeGate();
    gate.request();
    gate.request();
    assert.equal(state.reloads, 0);
    assert.equal(state.notices, 1);

    setFormBusy("deposit-request", false, T0 + 1000); // 다른 화면으로 이동(언마운트)
    assert.equal(state.reloads, 1);
    assert.equal(state.timers.size, 0, "만료 타이머도 정리된다");
  });

  it("busy가 안 풀려도 30분 상한이 지나면 새로고침한다 (옛 청크에 갇히지 않음)", () => {
    setFormBusy("corporate-card", true, T0);
    const { gate, state, advance } = makeGate(T0 + 10 * 60 * 1000);
    gate.request();
    assert.equal(state.reloads, 0);

    advance(19 * 60 * 1000); // 켠 지 29분
    assert.equal(state.reloads, 0);

    advance(2 * 60 * 1000); // 켠 지 31분
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
