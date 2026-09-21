/**
 * 비용계획 스위치 판정·캐시(순수 로직) 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFlagCache, evaluateFlag } from "./flag-logic";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("evaluateFlag (0020 app_flags · P1)", () => {
  it("행 없음·읽기 실패(null) → OFF", () => {
    assert.equal(evaluateFlag(null, ME), false);
    assert.equal(evaluateFlag(undefined, ME), false);
  });
  it("enabled=false 면 허용 목록에 있어도 OFF", () => {
    assert.equal(evaluateFlag({ enabled: false, allowUserIds: [ME] }, ME), false);
  });
  it("enabled=true + 목록 비움 → 전원 ON", () => {
    assert.equal(evaluateFlag({ enabled: true, allowUserIds: [] }, ME), true);
    assert.equal(evaluateFlag({ enabled: true, allowUserIds: [] }, OTHER), true);
  });
  it("enabled=true + 목록 있음 → 목록에 있는 사람만", () => {
    assert.equal(evaluateFlag({ enabled: true, allowUserIds: [ME] }, ME), true);
    assert.equal(evaluateFlag({ enabled: true, allowUserIds: [ME] }, OTHER), false);
  });
});

describe("createFlagCache", () => {
  it("TTL 안에서는 loader 를 한 번만 부른다", async () => {
    let t = 1_000;
    let calls = 0;
    const cache = createFlagCache({ ttlMs: 20_000, now: () => t });
    const loader = async () => {
      calls++;
      return { enabled: true, allowUserIds: [] };
    };
    assert.equal(evaluateFlag(await cache.get(loader), ME), true);
    t += 19_999;
    assert.equal(evaluateFlag(await cache.get(loader), ME), true);
    assert.equal(calls, 1);
    t += 2;
    await cache.get(loader);
    assert.equal(calls, 2);
  });

  it("loader 가 throw 하면 OFF 를 짧게(failureTtl) 캐시하고 다시 읽는다 — fail-closed", async () => {
    let t = 0;
    let calls = 0;
    const cache = createFlagCache({ ttlMs: 20_000, failureTtlMs: 5_000, now: () => t });
    const loader = async () => {
      calls++;
      if (calls === 1) throw new Error("db down");
      return { enabled: true, allowUserIds: [] };
    };
    assert.equal(await cache.get(loader), null);
    t += 4_999;
    assert.equal(await cache.get(loader), null);
    assert.equal(calls, 1);
    t += 2;
    assert.deepEqual(await cache.get(loader), { enabled: true, allowUserIds: [] });
    assert.equal(calls, 2);
  });

  it("동시에 들어온 요청은 loader 를 한 번만 부른다", async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const cache = createFlagCache({ now: () => 0 });
    const loader = async () => {
      calls++;
      await gate;
      return { enabled: true, allowUserIds: [] };
    };
    const p1 = cache.get(loader);
    const p2 = cache.get(loader);
    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(calls, 1);
    assert.deepEqual(r1, r2);
  });

  it("clear() 뒤에는 다시 읽는다", async () => {
    let calls = 0;
    const cache = createFlagCache({ now: () => 0 });
    const loader = async () => {
      calls++;
      return { enabled: false, allowUserIds: [] };
    };
    await cache.get(loader);
    cache.clear();
    await cache.get(loader);
    assert.equal(calls, 2);
  });
});

describe("createFlagCache — 읽기 실패는 onError 로 알린다 (QA D-12)", () => {
  it("loader 가 던지면 null 을 캐시하고 onError 에 원인을 넘긴다", async () => {
    const seen: unknown[] = [];
    const boom = new Error("connection refused");
    const cache = createFlagCache({ failureTtlMs: 5_000, now: () => 0, onError: (e) => seen.push(e) });
    assert.equal(await cache.get(async () => { throw boom; }), null);
    assert.deepEqual(seen, [boom]);
  });
  it("onError 가 던져도 판정은 OFF 로 끝난다", async () => {
    const cache = createFlagCache({
      now: () => 0,
      onError: () => {
        throw new Error("logger broke");
      },
    });
    assert.equal(await cache.get(async () => { throw new Error("db"); }), null);
  });
});
