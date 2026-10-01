/**
 * 사입 세금계산서 미발행 알림 문장 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReminderSlackText, stageForToday, type ReminderLine } from "./purchase-invoice-reminder";

const APP = "https://expenseone.vercel.app";
const lines: ReminderLine[] = [
  { expenseId: "e2", transactionDate: "2026-09-08", title: "조선미녀및 신규 화장품 sku 발주", submitterName: "강태운", pharmacyName: "마트", total: 4_257_675 },
  { expenseId: "e1", transactionDate: "2026-09-04", title: "이수,포레온 약손명가 발주", submitterName: "강태운", pharmacyName: "마트약국", total: 233_000 },
  { expenseId: "e1", transactionDate: "2026-09-04", title: "이수,포레온 약손명가 발주", submitterName: "강태운", pharmacyName: "포레온마트약국", total: 502_000 },
];

describe("stageForToday", () => {
  it("말일 예고 · 1·5·8일 리마인더 · 10일 마감 · 11일부터 지연", () => {
    assert.deepEqual(stageForToday({ y: 2026, m: 9, d: 30, isLastDay: true }), { kind: "preview", ym: "2026-09" });
    assert.deepEqual(stageForToday({ y: 2026, m: 10, d: 1, isLastDay: false }), { kind: "remind", ym: "2026-09", daysLeft: 9 });
    assert.deepEqual(stageForToday({ y: 2026, m: 10, d: 10, isLastDay: false }), { kind: "due", ym: "2026-09" });
    assert.deepEqual(stageForToday({ y: 2026, m: 10, d: 13, isLastDay: false }), { kind: "overdue", ym: "2026-09", daysLate: 3 });
    assert.equal(stageForToday({ y: 2026, m: 10, d: 3, isLastDay: false }), null);
    assert.deepEqual(stageForToday({ y: 2027, m: 1, d: 5, isLastDay: false }), { kind: "remind", ym: "2026-12", daysLeft: 5 });
  });
});

describe("buildReminderSlackText", () => {
  const stage = { kind: "remind", ym: "2026-09", daysLeft: 9 } as const;
  const text = buildReminderSlackText(stage, lines, { appUrl: APP, dueDate: "2026-10-10" });

  it("머리에 단계·대상 월·기한·남은 날, 줄 수와 합계", () => {
    assert.match(text, /^⏰ \*사입 세금계산서 미발행\*/);
    assert.match(text, /2026\.09분까지/);
    assert.match(text, /기한 2026\.10\.10 \(9일 남음\)/);
    assert.match(text, /약국 3곳 · 4,992,675원/);
  });

  it("줄마다 거래일·등록자·제목(링크)·약국·금액 — 오래된 것부터", () => {
    const items = text.split("\n").filter((l) => l.startsWith("• "));
    assert.equal(items.length, 3);
    assert.equal(items[0], `• 09.04 강태운 — <${APP}/expenses/e1|이수,포레온 약손명가 발주> → 마트약국 233,000원`);
    assert.equal(items[2], `• 09.08 강태운 — <${APP}/expenses/e2|조선미녀및 신규 화장품 sku 발주> → 마트 4,257,675원`);
  });

  it("왜 왔는지(발행 완료 표시가 없는 줄, 결제 방식은 안 봄)와 멈추는 법을 적는다", () => {
    assert.match(text, /「발행 완료」 표시가 없는/);
    assert.match(text, /결제 방식\(현금·외상\)은 보지 않습니다/);
    assert.match(text, /사입」 표시를 빼/);
    assert.match(text, new RegExp(`<${APP}/admin/purchase-invoice\\|발행 관리 열기>`));
  });

  it("단계별 머리", () => {
    const opts = { appUrl: APP, dueDate: "2026-10-10" };
    assert.match(buildReminderSlackText({ kind: "preview", ym: "2026-09" }, lines, opts), /^📋 \*사입 세금계산서 발행 예정\* — 2026\.09분, 기한 2026\.10\.10/);
    assert.match(buildReminderSlackText({ kind: "due", ym: "2026-09" }, lines, opts), /^🚨 \*오늘이 사입 계산서 발행 기한\*/);
    assert.match(buildReminderSlackText({ kind: "overdue", ym: "2026-09", daysLate: 4 }, lines, opts), /기한 2026\.10\.10을 4일 넘김/);
  });

  it("Slack 특수문자(& < >)는 이스케이프한다 — 링크가 깨지지 않게", () => {
    const t = buildReminderSlackText(stage, [{ ...lines[0], title: "A&B <특가>", pharmacyName: "약국>1" }], { appUrl: APP, dueDate: "2026-10-10" });
    assert.match(t, /\|A&amp;B &lt;특가&gt;>/);
    assert.match(t, /→ 약국&gt;1 /);
  });

  it("15줄까지만 적고 나머지는 '외 N곳'", () => {
    const many = Array.from({ length: 18 }, (_, i) => ({ ...lines[1], expenseId: `x${i}`, pharmacyName: `약국${i}` }));
    const t = buildReminderSlackText(stage, many, { appUrl: APP, dueDate: "2026-10-10" });
    assert.equal(t.split("\n").filter((l) => l.startsWith("• ")).length, 15);
    assert.match(t, /…외 3곳/);
  });

  it("등록자 이름이 없으면 빼고 적는다", () => {
    const t = buildReminderSlackText(stage, [{ ...lines[1], submitterName: null }], { appUrl: APP, dueDate: "2026-10-10" });
    assert.match(t, /^• 09\.04 — </m);
  });
});
