import assert from "node:assert/strict";
import test from "node:test";
import { splitExpenseNotes } from "./expense-notes";

test("설명과 여러 URL, 개행을 손실 없이 유지한다", () => {
  const text = "구매처 https://shop.example/items?a=1&b=2\n견적서 https://docs.example/견적서.pdf\n검토 부탁드립니다.";
  const parts = splitExpenseNotes(text);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.deepEqual(parts.filter((p) => p.href).map((p) => p.text), [
    "https://shop.example/items?a=1&b=2", "https://docs.example/견적서.pdf",
  ]);
});

test("www 주소에는 https를 붙이고 문장의 괄호와 마침표를 제외한다", () => {
  const text = "구매처(www.example.com/item). 문서 https://docs.example/wiki/Plan_(2026).";
  const parts = splitExpenseNotes(text);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.deepEqual(parts.filter((p) => p.href).map((p) => p.href), [
    "https://www.example.com/item", "https://docs.example/wiki/Plan_(2026)",
  ]);
});

test("HTML, 실행 가능한 스킴, 잘못된 주소는 링크로 만들지 않는다", () => {
  const text = '<script>alert(1)</script> javascript:alert(1) data:text/html,bad file:///tmp/a https://';
  const parts = splitExpenseNotes(text);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.ok(parts.every((p) => !p.href));
});

test("빈 설명과 URL 없는 설명도 그대로 표시한다", () => {
  assert.deepEqual(splitExpenseNotes(""), []);
  assert.deepEqual(splitExpenseNotes("추가 설명\n둘째 줄"), [{ text: "추가 설명\n둘째 줄" }]);
});
