// 처음 들어온 사람에게 보여 주는 안내 단계 정의. 문구는 여기 한곳에서만 고친다.
export type TourRole = "MEMBER" | "ADMIN";

export type TourArt =
  | "welcome"
  | "create"
  | "card"
  | "deposit"
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
    ],
  },
  {
    id: "card",
    art: "card",
    title: "법카는 알림이 오면 채우기만",
    body: () => [
      "법인카드로 결제하면 다음 날 아침 9시쯤 「법카 사용 내역 등록해주세요」 알림이 와요. 알림을 누르면 금액·가맹점이 채워져 있으니 제목과 카테고리만 고르고 제출하면 끝이에요. 법카는 바로 승인돼요.",
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
    art: "create",
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

export type TourMode = "full" | "new";

/** 이미 본 사람에게는 바뀐 안내만 한 번 더 보여 준다. */
export function getTourMode(v1: string | null, v2: string | null): TourMode | null {
  if (v1 !== "done") return "full";
  return v2 === null ? "new" : null;
}

export function getNewTourSteps(role: TourRole, isDesktop: boolean, plansEnabled: boolean): TourStep[] {
  return getTourSteps(role, isDesktop, plansEnabled).filter((s) => s.id === "deposit" || s.id === "plan");
}

export function lastStepLabel(mode: TourMode = "full"): string {
  return mode === "new" ? "알겠어요" : "시작하기";
}
