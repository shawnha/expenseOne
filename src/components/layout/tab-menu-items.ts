// 모바일 하단 탭 「메뉴」 시트의 항목 목록 — 순수 함수라 node:test 로 검증한다(React·아이콘 import 없음).
// 아이콘은 컴포넌트 대신 키 문자열로 두고, 시트 컴포넌트가 키 → lucide 아이콘으로 바꾼다.

export type TabMenuIconKey =
  | "repeat"
  | "plans"
  | "receipt-text"
  | "layout-dashboard"
  | "receipt"
  | "clock"
  | "bar-chart"
  | "user-check"
  | "shopping-bag"
  | "file-text"
  | "users"
  | "building"
  | "credit-card"
  | "settings";

export interface TabMenuLink {
  kind: "link";
  label: string;
  href: string;
  icon: TabMenuIconKey;
  /** 비용계획 스위치가 켜진 사람에게만(PlansNavGate). */
  gated?: boolean;
  /** 줄 오른쪽 숫자(GET /api/nav/badges). */
  badgeKey?: "pending" | "taxInvoices" | "plans";
}

export interface TabMenuTour {
  kind: "tour";
  label: string;
  icon: TabMenuIconKey;
}

export type TabMenuItem = TabMenuLink | TabMenuTour;

/** 안내 팝업이 이 이벤트를 받는다(다른 브랜치). 받는 쪽이 없으면 눌러도 아무 일 없다. */
export const OPEN_TOUR_EVENT = "expenseone:open-tour";

function linksFor(isAdmin: boolean): TabMenuLink[] {
  const common: TabMenuLink[] = [
    { kind: "link", label: "반복 입금요청", href: "/expenses/recurring", icon: "repeat" },
    { kind: "link", label: "비용계획", href: "/plans", icon: "plans", gated: true, badgeKey: "plans" },
    { kind: "link", label: "세금계산서", href: "/tax-invoices", icon: "receipt-text", badgeKey: "taxInvoices" },
  ];
  if (!isAdmin) {
    return [{ kind: "link", label: "설정", href: "/settings", icon: "settings" }, ...common];
  }
  return [
    { kind: "link", label: "관리 대시보드", href: "/admin", icon: "layout-dashboard" },
    ...common,
    { kind: "link", label: "전체 비용", href: "/admin/expenses", icon: "receipt" },
    { kind: "link", label: "승인 대기", href: "/admin/pending", icon: "clock", badgeKey: "pending" },
    { kind: "link", label: "리포트", href: "/admin/reports", icon: "bar-chart" },
    { kind: "link", label: "사업소득", href: "/admin/freelancers", icon: "user-check" },
    { kind: "link", label: "마트/약국", href: "/admin/mart-pharmacy", icon: "shopping-bag" },
    { kind: "link", label: "사입 계산서", href: "/admin/purchase-invoice", icon: "file-text" },
    { kind: "link", label: "사용자 관리", href: "/admin/users", icon: "users" },
    { kind: "link", label: "부서 관리", href: "/admin/departments", icon: "building" },
    { kind: "link", label: "고위드 카드", href: "/admin/gowid", icon: "credit-card" },
    { kind: "link", label: "설정", href: "/settings", icon: "settings" },
  ];
}

/** 첫 항목 = 탭이 예전에 바로 가던 곳(ADMIN 관리 대시보드 / MEMBER 설정). href 중복 없음. 마지막 = 사용 안내. */
export function buildTabMenuItems(isAdmin: boolean): TabMenuItem[] {
  const seen = new Set<string>();
  const links = linksFor(isAdmin).filter((l) => {
    if (seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });
  return [...links, { kind: "tour", label: "사용 안내 다시 보기", icon: "file-text" }];
}

/** 현재 경로가 메뉴 안 항목 중 하나인가 — 메뉴 탭을 활성으로 칠할지 정한다. */
export function isMenuPath(pathname: string, isAdmin: boolean): boolean {
  return buildTabMenuItems(isAdmin).some(
    (i) => i.kind === "link" && (pathname === i.href || pathname.startsWith(i.href + "/")),
  );
}
