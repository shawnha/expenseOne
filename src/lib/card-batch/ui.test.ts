import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultTitle,
  reapplyPrefix,
  defaultDateRange,
  initialDateRange,
  kstDateString,
  sumSelected,
  pickDefaultCompany,
  formatMonthDay,
  defaultSelection,
  failedFirst,
} from "./ui";

describe("buildDefaultTitle", () => {
  it("앞머리와 가맹점을 공백으로 잇는다", () => {
    assert.equal(buildDefaultTitle("[밴쿠버 출장]", "스타벅스"), "[밴쿠버 출장] 스타벅스");
  });
  it("앞머리가 비면 가맹점만", () => {
    assert.equal(buildDefaultTitle("  ", "스타벅스"), "스타벅스");
  });
  it("가맹점이 없으면 앞머리만", () => {
    assert.equal(buildDefaultTitle("[출장]", null), "[출장]");
  });
});

describe("reapplyPrefix", () => {
  const items = [
    { id: "a", storeName: "스타벅스" },
    { id: "b", storeName: "택시" },
  ];
  it("손으로 고친 제목은 유지하고 나머지만 새 앞머리로 바꾼다", () => {
    const out = reapplyPrefix(items, { a: "[옛] 스타벅스", b: "내 제목" }, new Set(["b"]), "[새]");
    assert.deepEqual(out, { a: "[새] 스타벅스", b: "내 제목" });
  });
  it("앞머리를 지우면 가맹점만 남는다", () => {
    const out = reapplyPrefix(items, {}, new Set(), "");
    assert.deepEqual(out, { a: "스타벅스", b: "택시" });
  });
});

describe("date range (KST)", () => {
  it("UTC 15:00 이후는 KST 다음 날이다", () => {
    assert.equal(kstDateString(new Date("2026-10-22T16:00:00Z")), "2026-10-23");
  });
  it("최근 14일 ~ 오늘", () => {
    assert.deepEqual(defaultDateRange(new Date("2026-10-23T03:00:00Z")), {
      from: "2026-10-09",
      to: "2026-10-23",
    });
  });
  it("월 경계를 넘는다", () => {
    assert.equal(defaultDateRange(new Date("2026-03-05T00:00:00Z")).from, "2026-02-19");
  });
});

describe("initialDateRange", () => {
  const now = new Date("2026-10-26T03:00:00Z");
  it("링크가 준 시작일 ~ 오늘", () => {
    assert.deepEqual(initialDateRange(now, "2026-08-28"), { from: "2026-08-28", to: "2026-10-26" });
    assert.deepEqual(initialDateRange(now, "2026-10-26"), { from: "2026-10-26", to: "2026-10-26" });
  });
  it("없거나 이상한 값·미래·최대 기간 초과면 기본 14일", () => {
    const fallback = defaultDateRange(now);
    for (const v of [undefined, null, "", "20260828", "2026-02-31", "2026-10-27", "2026-08-24", "abc"]) {
      assert.deepEqual(initialDateRange(now, v), fallback, String(v));
    }
    // 정확히 최대 기간(62일)까지는 허용
    assert.equal(initialDateRange(now, "2026-08-25").from, "2026-08-25");
  });
});

describe("sumSelected", () => {
  it("선택된 것만 더한다", () => {
    const items = [
      { id: "a", amount: 1000 },
      { id: "b", amount: 2500 },
      { id: "c", amount: 300 },
    ];
    assert.equal(sumSelected(items, new Set(["a", "c"])), 1300);
    assert.equal(sumSelected(items, new Set()), 0);
  });
});

describe("pickDefaultCompany", () => {
  it("가장 많은 mappedCompanyId", () => {
    const items = [
      { mappedCompanyId: "x" },
      { mappedCompanyId: "y" },
      { mappedCompanyId: "y" },
      { mappedCompanyId: null },
    ];
    assert.equal(pickDefaultCompany(items, "u"), "y");
  });
  it("없으면 사용자 회사", () => {
    assert.equal(pickDefaultCompany([{ mappedCompanyId: null }], "u"), "u");
    assert.equal(pickDefaultCompany([], null), null);
  });
  it("활성 회사 목록에 없는 매핑은 세지 않는다", () => {
    const items = [{ mappedCompanyId: "gone" }, { mappedCompanyId: "gone" }, { mappedCompanyId: "y" }];
    assert.equal(pickDefaultCompany(items, "u", ["y", "u"]), "y");
    assert.equal(pickDefaultCompany([{ mappedCompanyId: "gone" }], "u", ["y", "u"]), "u");
    assert.equal(pickDefaultCompany([{ mappedCompanyId: "gone" }], "gone2", ["y"]), null);
  });
});

describe("formatMonthDay", () => {
  it("MM.DD", () => {
    assert.equal(formatMonthDay("2026-10-09"), "10.09");
  });
});

describe("defaultSelection", () => {
  it("중복 의심은 빼고 앞에서부터 max건", () => {
    const items = [
      { id: "a", possibleDuplicate: false },
      { id: "b", possibleDuplicate: true },
      { id: "c", possibleDuplicate: false },
      { id: "d", possibleDuplicate: false },
    ];
    assert.deepEqual([...defaultSelection(items, 2)], ["a", "c"]);
    assert.deepEqual([...defaultSelection(items, 10)], ["a", "c", "d"]);
  });
});

describe("failedFirst", () => {
  it("실패한 행을 앞으로, 나머지 순서 유지", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.deepEqual(failedFirst(items, { c: "x" }).map((x) => x.id), ["c", "a", "b"]);
    assert.equal(failedFirst(items, {}), items);
  });
});
