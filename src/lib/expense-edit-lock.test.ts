/**
 * 승인된 입금요청 수정 잠금 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findLockedChanges,
  isApprovedDepositLocked,
  lockedChangeMessage,
  omitLockedFields,
  type LockableExpense,
  type LockablePurchaseLine,
} from "./expense-edit-lock";
import { updateExpenseSchema } from "./validations/expense";

const COMPANY_ID = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";

/** DB에서 읽은 승인된 입금요청(사입 아님). */
const current: LockableExpense = {
  amount: 1_500_000,
  companyId: COMPANY_ID,
  bankName: "국민은행",
  accountHolder: "홍길동",
  accountNumber: "123-456-7890",
  isPrePaid: true,
  prePaidPercentage: 30,
  hasFreelancerWithholding: false,
  transactionDate: "2026-09-10",
  isPurchase: false,
};

/** 수정 폼이 보내는 본문 전체(값은 DB와 같음). */
const fullBody = {
  title: "9월 임대료",
  description: null,
  amount: 1_500_000,
  category: "OTHER",
  bankName: "국민은행",
  accountHolder: "홍길동",
  accountNumber: "123-456-7890",
  isUrgent: false,
  isPrePaid: true,
  prePaidPercentage: 30,
  dueDate: "2026-09-30",
  companyId: COMPANY_ID,
  hasFreelancerWithholding: false,
};

/** DB에 저장된 사입 줄(sortOrder 순). */
const storedLines: LockablePurchaseLine[] = [
  {
    pharmacyName: "행복약국",
    pharmacyBizNo: "123-45-67890",
    supplyAmount: 100_000,
    vatAmount: 10_000,
    purchaseItems: "마스크 100매",
  },
  {
    pharmacyName: "튼튼약국",
    pharmacyBizNo: null,
    supplyAmount: 50_000,
    vatAmount: 5_000,
    purchaseItems: null,
  },
];

const purchaseCurrent: LockableExpense = { ...current, isPurchase: true };

describe("findLockedChanges", () => {
  it("같은 값으로 전체 필드를 보내면 통과한다", () => {
    assert.deepEqual(findLockedChanges(current, fullBody, []), []);
  });

  it("키가 없으면 변경으로 보지 않는다", () => {
    assert.deepEqual(findLockedChanges(current, { title: "제목만" }, []), []);
    assert.deepEqual(findLockedChanges(current, {}, []), []);
  });

  it("허용 필드만 바꾸면 통과한다", () => {
    const body = {
      ...fullBody,
      title: "9월 임대료 (영수증 첨부)",
      description: "세금계산서 보충",
      category: "RENT",
      isUrgent: true,
      dueDate: null,
      merchantName: "건물주",
      branch: "STORE_1" as const,
      status: "SUBMITTED" as const,
    };
    assert.deepEqual(findLockedChanges(current, body, []), []);
  });

  it("금액 변경은 차단한다", () => {
    assert.deepEqual(
      findLockedChanges(current, { ...fullBody, amount: 1_600_000 }, []),
      ["amount"],
    );
  });

  it("계좌번호 앞뒤 공백 차이도 변경으로 본다", () => {
    assert.deepEqual(
      findLockedChanges(current, { ...fullBody, accountNumber: "123-456-7890 " }, []),
      ["accountNumber"],
    );
  });

  it("빈 문자열과 null은 같게 본다", () => {
    const noBank: LockableExpense = { ...current, bankName: null, accountHolder: null };
    assert.deepEqual(
      findLockedChanges(noBank, { ...fullBody, bankName: "", accountHolder: "" }, []),
      [],
    );
    // 반대로 빈 값에 실제 값을 넣으면 변경
    assert.deepEqual(
      findLockedChanges(noBank, { ...fullBody, bankName: "신한은행", accountHolder: "" }, []),
      ["bankName"],
    );
  });

  it("회사 ID는 대소문자를 무시한다", () => {
    assert.deepEqual(
      findLockedChanges(current, { ...fullBody, companyId: COMPANY_ID.toUpperCase() }, []),
      [],
    );
    assert.deepEqual(
      findLockedChanges(
        current,
        { ...fullBody, companyId: "00000000-0000-4000-8000-000000000000" },
        [],
      ),
      ["companyId"],
    );
  });

  it("선지급 비율은 null과 미지정을 같게, 값 차이는 변경으로 본다", () => {
    const notPrePaid: LockableExpense = { ...current, isPrePaid: false, prePaidPercentage: null };
    assert.deepEqual(
      findLockedChanges(notPrePaid, { isPrePaid: false, prePaidPercentage: null }, []),
      [],
    );
    assert.deepEqual(
      findLockedChanges(current, { prePaidPercentage: null }, []),
      ["prePaidPercentage"],
    );
    assert.deepEqual(
      findLockedChanges(current, { prePaidPercentage: 50 }, []),
      ["prePaidPercentage"],
    );
  });

  it("불리언·거래일은 엄격 비교한다", () => {
    assert.deepEqual(
      findLockedChanges(
        current,
        {
          ...fullBody,
          isPrePaid: false,
          hasFreelancerWithholding: true,
          transactionDate: "2026-09-11",
          isPurchase: true,
        },
        [],
      ),
      ["isPrePaid", "hasFreelancerWithholding", "transactionDate", "isPurchase"],
    );
  });

  it("사입 줄이 같으면(표기만 다르면) 통과한다", () => {
    const body = {
      isPurchase: true,
      purchaseLines: [
        {
          pharmacyName: " 행복약국 ",
          pharmacyBizNo: "1234567890",
          supplyAmount: 100_000,
          vatAmount: 10_000,
          purchaseItems: "마스크 100매  ",
        },
        {
          pharmacyName: "튼튼약국",
          pharmacyBizNo: "",
          supplyAmount: 50_000,
          vatAmount: 5_000,
          purchaseItems: "",
        },
      ],
    };
    assert.deepEqual(findLockedChanges(purchaseCurrent, body, storedLines), []);
  });

  it("사입 줄의 금액·순서·개수가 바뀌면 차단한다", () => {
    const same = storedLines.map((l) => ({ ...l }));

    const supplyChanged = same.map((l, i) => (i === 0 ? { ...l, supplyAmount: 120_000 } : l));
    assert.deepEqual(
      findLockedChanges(purchaseCurrent, { purchaseLines: supplyChanged }, storedLines),
      ["purchaseLines"],
    );

    const vatChanged = same.map((l, i) => (i === 1 ? { ...l, vatAmount: 0 } : l));
    assert.deepEqual(
      findLockedChanges(purchaseCurrent, { purchaseLines: vatChanged }, storedLines),
      ["purchaseLines"],
    );

    const reordered = [same[1], same[0]];
    assert.deepEqual(
      findLockedChanges(purchaseCurrent, { purchaseLines: reordered }, storedLines),
      ["purchaseLines"],
    );

    assert.deepEqual(
      findLockedChanges(purchaseCurrent, { purchaseLines: same.slice(0, 1) }, storedLines),
      ["purchaseLines"],
    );

    // 사입 아닌 건에 빈 배열은 그대로(줄 없음 = 줄 없음)
    assert.deepEqual(findLockedChanges(current, { purchaseLines: [] }, []), []);
  });

  it("여러 필드가 바뀌면 정해진 순서로 모두 돌려준다", () => {
    const changed = findLockedChanges(
      current,
      { ...fullBody, accountNumber: "999", amount: 1 },
      [],
    );
    assert.deepEqual(changed, ["amount", "accountNumber"]);
    assert.equal(
      lockedChangeMessage(changed),
      "승인된 입금요청은 금액, 계좌번호을(를) 수정할 수 없습니다. 변경이 필요하면 관리자에게 승인 취소를 요청해주세요.",
    );
  });
});

describe("isApprovedDepositLocked", () => {
  it("비관리자의 승인된 입금요청에만 걸린다", () => {
    const approvedDeposit = { type: "DEPOSIT_REQUEST", status: "APPROVED" };
    assert.equal(isApprovedDepositLocked("MEMBER", approvedDeposit), true);
    assert.equal(isApprovedDepositLocked(undefined, approvedDeposit), true);
    assert.equal(isApprovedDepositLocked("ADMIN", approvedDeposit), false);
    assert.equal(
      isApprovedDepositLocked("MEMBER", { type: "DEPOSIT_REQUEST", status: "SUBMITTED" }),
      false,
    );
    assert.equal(
      isApprovedDepositLocked("MEMBER", { type: "CORPORATE_CARD", status: "APPROVED" }),
      false,
    );
  });
});

describe("omitLockedFields", () => {
  it("잠금 필드만 빼고 허용·무시 필드는 남긴다", () => {
    const body = {
      ...fullBody,
      isPurchase: true,
      purchaseLines: [],
      merchantName: "건물주",
      branch: null,
      status: "APPROVED" as const,
    };
    assert.deepEqual(omitLockedFields(body), {
      title: "9월 임대료",
      description: null,
      category: "OTHER",
      isUrgent: false,
      dueDate: "2026-09-30",
      merchantName: "건물주",
      branch: null,
      status: "APPROVED",
    });
    // 원본은 건드리지 않는다
    assert.equal(body.amount, 1_500_000);
  });
});

describe("updateExpenseSchema — 사입 줄 삭제 버그 회귀", () => {
  // 예전엔 isPurchase에 default(false)가 있어서, 사입과 무관한 저장(호점 지정,
  // 제목 수정)도 isPurchase:false로 파싱됐고 서비스가 사입 줄을 발행 이력까지
  // 전부 지웠다. 이 테스트가 깨지면 그 버그가 돌아온 것이다.
  it("isPurchase를 보내지 않으면 파싱 결과에도 키가 없다", () => {
    assert.equal("isPurchase" in updateExpenseSchema.parse({ branch: "STORE_1" }), false);
    assert.equal("isPurchase" in updateExpenseSchema.parse({ title: "영수증 보충" }), false);
  });

  it("명시적으로 보낸 false는 그대로 남는다", () => {
    assert.equal(updateExpenseSchema.parse({ isPurchase: false }).isPurchase, false);
  });

  it("스키마를 거친 사입 줄에서 부가세를 빼면 0으로 채워져 변경으로 본다", () => {
    const parsed = updateExpenseSchema.parse({
      isPurchase: true,
      // 부가세만 빠진 요청 — 나머지는 저장된 값과 같다
      purchaseLines: storedLines.map((l) => {
        const withoutVat: Record<string, unknown> = { ...l };
        delete withoutVat.vatAmount;
        return withoutVat;
      }),
    });
    assert.deepEqual(findLockedChanges(purchaseCurrent, parsed, storedLines), ["purchaseLines"]);
  });
});
