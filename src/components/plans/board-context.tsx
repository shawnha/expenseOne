"use client";

import { createContext, useContext } from "react";
import type { PlanMoveSource } from "@/lib/plans/move";
import type { PlanCard } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// 보드 ↔ 카드가 주고받는 동작. 카드는 자기 일(제스처·메뉴)만 하고, 달 옮기기·수정·삭제 같은
// 보드 전체에 걸친 일은 여기로 올린다. 보드 밖(상세 화면 등)에서 카드를 그리면 null 이라
// 카드는 링크로만 동작한다.
// ---------------------------------------------------------------------------

export type DragState = readonly PlanMoveSource[];

export interface PlanBoardActions {
  /** 마우스(hover + fine pointer) 환경. 터치에서는 HTML5 드래그 대신 빠른 메뉴를 쓴다. */
  canDrag: boolean;
  dragging: DragState | null;
  startDrag: (card: PlanCard) => void;
  endDrag: () => void;
  dropPlans: (projectId?: string, month?: string) => void;
  selecting: boolean;
  selectedIds: ReadonlySet<string>;
  selectionCompanyId?: string;
  toggleSelected: (card: PlanCard) => void;
  /** 이전 달(-1) / 다음 달(+1). */
  shiftMonth: (cardId: string, delta: 1 | -1) => void;
  openEdit: (card: PlanCard) => void;
  /** 「입금요청으로 만들기」 — 이 계획을 고른 채로 입금요청 폼을 연다. */
  createDepositRequest: (card: PlanCard) => void;
  /** 빠른 메뉴를 열면 입금요청 폼을 미리 가져온다. */
  prefetchDepositRequest: (card: PlanCard) => void;
  /** 「법카로 썼어요」 — 계획 상세에서 법카 연결 창을 연다. */
  linkCardPayment: (card: PlanCard) => void;
  /** '삭제' = 기존 취소 흐름(status CANCELLED). 확인 단계가 있다. */
  openDelete: (card: PlanCard) => void;
  /** 스와이프로 열린 카드는 한 장만. */
  swipeOpenId: string | null;
  setSwipeOpenId: (id: string | null) => void;
  /** 대표만 카드 메뉴에 "ERP 반영 표시/해제" 가 보인다(서버도 403 으로 막는다). */
  isExecutive: boolean;
  /** "ERP 반영함" 표시 뒤집기. 낙관적으로 먼저 바꾸고 POST, 실패하면 되돌린다. 이중 제출은 카드가 막는다. */
  toggleErpApplied: (cardId: string) => Promise<void>;
  /** "지급 완료" 표시 뒤집기(참여자 누구나). 표시하면 카드가 접히고 그 달 맨 아래로 내려간다. */
  togglePaid: (cardId: string) => Promise<void>;
}

export const PlanBoardContext = createContext<PlanBoardActions | null>(null);

export function usePlanBoard(): PlanBoardActions | null {
  return useContext(PlanBoardContext);
}
