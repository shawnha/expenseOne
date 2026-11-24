// 처음 들어온 사람에게 보여 주는 안내 단계 정의. 문구는 여기 한곳에서만 고친다.
import { CARD_MEAL_TRANSPORT_GUIDANCE } from "@/lib/help/content";

export type TourRole = "MEMBER" | "ADMIN";

export type TourArt =
  | "welcome"
  | "create"
  | "card"
  | "cardSetup"
  | "deposit"
  | "plan"
  | "status"
  | "admin"
  | "done";

export interface TourStep {
  id: string;
  art: TourArt;
  title: string;
  body: string[];
}

interface StepDef {
  id: string;
  art: TourArt;
  adminOnly?: boolean;
  plansOnly?: boolean;
  title: string;
  body: (isDesktop: boolean) => string[];
}

const STEP_DEFS: StepDef[] = [
  {
    id: "welcome",
    art: "welcome",
    title: "ExpenseOne에 오신 걸 환영해요",
    body: () => [
      "회사 돈으로 쓴 비용을 올리고, 승인 결과를 받아 보는 곳이에요. 핵심만 1분 안에 알려 드릴게요.",
    ],
  },
  {
    id: "create",
    art: "create",
    title: "비용 올리기는 「+」",
    body: (d) => [
      d
        ? "오른쪽 위 파란 「+ 새 비용」 버튼을 누르면 비용을 올릴 수 있어요."
        : "아래 가운데 파란 「+」 버튼을 누르면 비용을 올릴 수 있어요.",
      "법카사용·입금요청·반품/환불, 법카 여러 건 한 번에, 세금계산서 발행 요청 중에서 골라요.",
      "월세처럼 매달 나가는 돈은 메뉴의 「반복 지급」에 한 번 등록해 두면 날짜에 알려 드려요. 법카로 매달 내는 구독료는 법카사용 화면에서 「정기 결제」를 체크해요.",
    ],
  },
  {
    id: "card",
    art: "card",
    title: "법인카드 사용 내역 올리기",
    body: () => [
      CARD_MEAL_TRANSPORT_GUIDANCE,
      "직접 올려야 하는 결제는 다음 날 아침 9시쯤 「법카 사용 내역 등록해주세요」 알림을 확인해요. 알림을 누르면 금액·가맹점이 채워져 있어요. 제목과 카테고리를 고르고 제출하면 바로 승인돼요.",
    ],
  },
  {
    id: "cardSetup",
    art: "cardSetup",
    title: "알림을 받으려면 내 카드 등록",
    body: (d) => [
      d
        ? "왼쪽 메뉴 아래쪽 「설정」 → 「내 법인카드」에서 점선으로 보이는 내 카드 끝 4자리를 눌러 등록해요."
        : "아래 「메뉴」 → 「설정」 → 「내 법인카드」에서 점선으로 보이는 내 카드 끝 4자리를 눌러 등록해요.",
      "등록해야 결제 알림이 오고, 그동안 쌓인 결제도 내 것으로 넘어와요. 내 카드가 안 보이면 관리자에게 말해 주세요.",
    ],
  },
  {
    id: "deposit",
    art: "deposit",
    title: "입금요청은 증빙부터",
    body: () => [
      "견적서·청구서·통장사본을 먼저 올리면 금액·계좌를 읽어 채워요. 자동으로 채운 칸에는 「…에서 채움」 표시가 붙으니 맞는지 보고, 제출 전 요약에서 한 번 더 확인해요. 관리자가 승인하면 입금돼요.",
    ],
  },
  {
    id: "plan",
    art: "plan",
    plansOnly: true,
    title: "계획에서 바로 올리기",
    body: () => [
      "「+」 맨 위 「곧 나갈 내 계획」에서 「입금요청」을 누르면 제목·금액이 채워지고 계획에 연결돼요. 법카로 냈으면 「법카 연결」로 카드 내역을 이어요.",
    ],
  },
  {
    id: "status",
    art: "status",
    title: "상태 읽는 법",
    body: () => [
      "제출: 관리자가 보기 전이에요 · 승인: 처리됐어요 · 반려: 사유를 확인하고 고쳐서 다시 올려요 · 취소: 내가 거둬들인 건이에요.",
      "결과는 종 모양 알림으로 와요. 알림 허용을 눌러 두면 휴대폰으로도 받아요.",
    ],
  },
  {
    id: "admin",
    art: "admin",
    adminOnly: true,
    title: "관리자: 승인 대기",
    body: () => [
      "관리자 메뉴의 「승인 대기」에서 입금요청을 승인하거나 반려해요. 「전체 비용」에서는 체크해서 여러 건을 한 번에 승인할 수 있어요(컴퓨터 화면).",
      "주인 없는 법인카드는 「고위드 카드」에서 사람을 지정해 주세요. 지정하기 전 결제는 아무에게도 알림이 가지 않아요.",
    ],
  },
  {
    id: "done",
    art: "done",
    title: "준비 끝!",
    body: (d) => [
      d
        ? "이 안내는 오른쪽 위 내 이름 메뉴 → 「사용 안내 다시 보기」에서 언제든 다시 볼 수 있어요."
        : "휴대폰에서는 공유 버튼 → 「홈 화면에 추가」로 앱처럼 쓸 수 있어요(아이폰은 이렇게 해야 알림이 와요). 이 안내는 오른쪽 위 내 이름 메뉴 → 「사용 안내 다시 보기」에서 언제든 다시 볼 수 있어요.",
    ],
  },
];

export function getTourSteps(role: TourRole, isDesktop: boolean, plansEnabled: boolean): TourStep[] {
  return STEP_DEFS.filter((s) => (!s.adminOnly || role === "ADMIN") && (!s.plansOnly || plansEnabled)).map((s) => ({
    id: s.id,
    art: s.art,
    title: s.title,
    body: s.body(isDesktop),
  }));
}

/**
 * full = 처음 보는 사람. new = v3 만 못 본 사람(카드 등록·관리자 고위드 안내).
 * newAll = v2(입금요청 증빙·계획) 도 못 본 사람 — v2 와 v3 장을 함께.
 */
export type TourMode = "full" | "new" | "newAll";

/** 이미 본 사람에게는 바뀐 안내만 한 번 더 보여 준다. */
export function getTourMode(v1: string | null, v2: string | null, v3: string | null = null): TourMode | null {
  if (v1 !== "done") return "full";
  if (v2 === null) return "newAll";
  return v3 === null ? "new" : null;
}

export function isNewMode(mode: TourMode): boolean {
  return mode !== "full";
}

const V2_IDS = ["deposit", "plan"];
const V3_IDS = ["cardSetup", "admin"];

export function getNewTourSteps(
  role: TourRole,
  isDesktop: boolean,
  plansEnabled: boolean,
  mode: TourMode = "new",
): TourStep[] {
  const ids = mode === "newAll" ? [...V2_IDS, ...V3_IDS] : V3_IDS;
  return getTourSteps(role, isDesktop, plansEnabled).filter((s) => ids.includes(s.id));
}

export function lastStepLabel(mode: TourMode = "full"): string {
  return isNewMode(mode) ? "알겠어요" : "시작하기";
}
