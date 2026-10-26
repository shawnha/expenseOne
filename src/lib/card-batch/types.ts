/**
 * 법카 결제 여러 건 한 번에 올리기(출장 등) — 서버와 화면이 같이 쓰는 계약.
 * 금액·가맹점·날짜는 언제나 고위드 거래에서 서버가 직접 읽는다. 화면은 어느 거래를 올릴지와
 * 제목·카테고리·회사만 보낸다.
 */

/** 아직 비용으로 올리지 않은 내 법카 결제 한 건 */
export interface PendingCardTx {
  /** gowid_transactions.id — 올릴 때 이 값만 보낸다 */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM (없으면 null) */
  time: string | null;
  /** 원화 청구 금액(원). 해외 결제도 원화로 환산된 값이다 */
  amount: number;
  /** 결제 통화(KRW, USD, CAD …) — 해외 결제 표시용. 금액 단위는 언제나 원 */
  currency: string;
  storeName: string | null;
  cardLastFour: string | null;
  /** 카드에 연결된 회사 (없으면 null) */
  mappedCompanyId: string | null;
  /** 같은 날짜(±2일)에 같은 금액이나 같은 가맹점으로 이미 올린 법카 비용이 있다 — 기본 선택에서 뺀다 */
  possibleDuplicate: boolean;
}

/** GET /api/card-transactions/pending?from=&to= 응답 data */
export interface PendingCardTxList {
  items: PendingCardTx[];
  /** 기간 안에 더 있어 잘렸는지 */
  truncated: boolean;
}

/** POST /api/expenses/card-batch 본문 */
export interface CardBatchRequest {
  companyId: string;
  category: string;
  items: Array<{ gowidTxId: string; title: string; description?: string | null }>;
  /** 비용계획 「법카로 썼어요」에서 왔으면 그 계획. 올린 비용을 한 번에 잇는다(라우트가 linkExpenses 로). */
  planId?: string | null;
}

export type CardBatchItemResult =
  | { gowidTxId: string; ok: true; expenseId: string }
  | { gowidTxId: string; ok: false; message: string };

/** POST /api/expenses/card-batch 응답 data */
export interface CardBatchResponse {
  created: number;
  failed: number;
  results: CardBatchItemResult[];
  /** planId 를 보냈을 때만: 계획에 이어진 건수. 비용은 그대로 두고 연결만 실패할 수 있다(회사가 다름 등). */
  planLinked?: number;
  /** 연결이 하나도 안 됐을 때 이유(사람이 읽는 말). */
  planLinkError?: string | null;
}

/** 한 번에 올릴 수 있는 최대 건수 */
export const CARD_BATCH_MAX = 50;
/** 목록 조회 최대 기간(일) */
export const CARD_BATCH_MAX_RANGE_DAYS = 62;
