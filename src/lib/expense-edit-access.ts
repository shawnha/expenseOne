// ---------------------------------------------------------------------------
// 비용 수정 권한 — 한 곳에서 정한다 (DB 없음, 단위 테스트 대상)
//
// 상세 화면의 「수정」 버튼, 수정 화면 진입, 첨부 올리기·지우기가 모두 이 함수를 본다.
// 규칙이 두 곳에 따로 있으면 "버튼은 보이는데 눌러도 되돌아온다"가 생긴다(2026-08-11 법카 7일 규칙,
// 2026-10-04 관리자 수정 — 상세는 관리자에게 버튼을 띄우는데 수정 화면은 작성자만 들여보냈다).
//
// 규칙
//   - 작성자 또는 **관리자**(2026-10-04 오너: "관리자는 모든 사람이 올린 것을 수정할 수 있도록").
//   - 제출(SUBMITTED)·승인(APPROVED)만. 반려·취소는 끝난 상태다.
//   - 반품(REFUND)은 못 고친다 — 잘못 넣었으면 삭제 후 다시 등록.
//
// 서버(updateExpense)는 관리자에게 상태 제한을 두지 않는다(관리자 API 로 상태를 바꾸는 경로가 있다).
// 화면이 더 좁은 것은 의도다 — 둘을 "맞추려고" 서버를 좁히거나 화면을 넓히지 말 것.
// ---------------------------------------------------------------------------

export interface EditViewer {
  id: string;
  role: "MEMBER" | "ADMIN" | string;
}

export interface EditableExpense {
  type: string;
  status: string;
  submittedById: string;
}

function isOpenStatus(status: string): boolean {
  return status === "SUBMITTED" || status === "APPROVED";
}

function isOwnerOrAdmin(expense: EditableExpense, viewer: EditViewer): boolean {
  return viewer.role === "ADMIN" || expense.submittedById === viewer.id;
}

/** 수정 화면에 들어갈 수 있나(상세의 「수정」 버튼도 같은 답). */
export function canEditExpense(expense: EditableExpense, viewer: EditViewer | null | undefined): boolean {
  if (!viewer) return false;
  if (expense.type === "REFUND") return false;
  if (!isOpenStatus(expense.status)) return false;
  return isOwnerOrAdmin(expense, viewer);
}

/**
 * 첨부를 올릴 수 있나. 작성자 또는 관리자. 반려·취소 건은 막는다.
 * 승인 건은 열어 둔다 — 영수증을 나중에 붙이는 일이 흔하고, 법카는 등록하자마자 승인 상태다.
 */
export function canUploadAttachment(expense: EditableExpense, viewer: EditViewer): boolean {
  if (expense.status === "REJECTED" || expense.status === "CANCELLED") return false;
  return isOwnerOrAdmin(expense, viewer);
}

/**
 * 첨부를 지울 수 있나. **올린 사람** 또는 관리자(작성자라도 관리자가 올린 파일은 못 지운다 — 예전 규칙 그대로).
 * 반려 건은 막는다(감사 기록). 승인 건은 영수증 교체 흐름 때문에 연다.
 */
export function canDeleteAttachment(
  attachment: { uploadedById: string },
  expense: { status: string } | null | undefined,
  viewer: EditViewer,
): boolean {
  if (expense?.status === "REJECTED") return false;
  return viewer.role === "ADMIN" || attachment.uploadedById === viewer.id;
}
