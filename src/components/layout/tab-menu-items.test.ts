import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTabMenuItems, isMenuPath } from "./tab-menu-items";

test("ADMIN 첫 항목은 관리 대시보드(/admin)", () => {
  const first = buildTabMenuItems(true)[0];
  assert.equal(first.kind, "link");
  assert.equal(first.label, "관리 대시보드");
  assert.equal(first.kind === "link" && first.href, "/admin");
});

test("MEMBER 첫 항목은 설정(/settings)", () => {
  const first = buildTabMenuItems(false)[0];
  assert.equal(first.label, "설정");
  assert.equal(first.kind === "link" && first.href, "/settings");
});

test("href 중복 없음(역할 무관)", () => {
  for (const admin of [true, false]) {
    const hrefs = buildTabMenuItems(admin).flatMap((i) => (i.kind === "link" ? [i.href] : []));
    assert.equal(new Set(hrefs).size, hrefs.length);
  }
});

test("마지막 항목은 사용 안내이고 하나뿐", () => {
  for (const admin of [true, false]) {
    const items = buildTabMenuItems(admin);
    assert.equal(items[items.length - 1].kind, "tour");
    assert.equal(items.filter((i) => i.kind === "tour").length, 1);
  }
});

test("MEMBER 에는 관리자 항목이 없다", () => {
  const hrefs = buildTabMenuItems(false).flatMap((i) => (i.kind === "link" ? [i.href] : []));
  assert.ok(hrefs.every((h) => !h.startsWith("/admin")));
});

test("isMenuPath", () => {
  assert.equal(isMenuPath("/admin/users", true), true);
  assert.equal(isMenuPath("/settings", false), true);
  assert.equal(isMenuPath("/expenses/recurring", false), true);
  assert.equal(isMenuPath("/expenses", false), false);
  assert.equal(isMenuPath("/", true), false);
  assert.equal(isMenuPath("/admin", false), false);
});
