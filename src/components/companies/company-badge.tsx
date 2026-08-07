import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 회사 배지 — 목록/테이블에서 어느 법인 비용인지 색으로 구분한다.
//
// 예전엔 이 컴포넌트와 색상 표가 4개 파일에 그대로 복사돼 있었고
// (expense-table, pending-table, users-table, department-manager) korea/retail
// 두 색만 있었다. 법인이 4개로 늘면서 HOI와 파트너스가 **둘 다 회색**이 돼
// 서로 구분되지 않았다. 여기로 합치고 미등록 slug도 색을 받게 한다.
// ---------------------------------------------------------------------------

/**
 * DESIGN.md 팔레트 기준. 빨강(--color-error)은 '반려'와 겹쳐서 뺐고,
 * 주황(--color-warning)은 '대기' 배지 및 users-table의 '미지정' 텍스트와
 * 겹치므로 뒤로 미뤘다.
 */
const COMPANY_BADGE_PALETTE = [
  "bg-[rgba(0,122,255,0.1)] text-[#007AFF] dark:bg-[rgba(0,122,255,0.2)]", // blue
  "bg-[rgba(52,199,89,0.1)] text-[#34C759] dark:bg-[rgba(52,199,89,0.2)]", // green
  "bg-[rgba(88,86,214,0.1)] text-[#5856D6] dark:bg-[rgba(88,86,214,0.2)]", // purple
  "bg-[rgba(48,176,199,0.1)] text-[#30B0C7] dark:bg-[rgba(48,176,199,0.2)]", // teal
  "bg-[rgba(255,45,85,0.1)] text-[#FF2D55] dark:bg-[rgba(255,45,85,0.2)]", // pink
  "bg-[rgba(255,149,0,0.1)] text-[#FF9500] dark:bg-[rgba(255,149,0,0.2)]", // orange
];

/**
 * 색을 고정한 회사. korea=파랑, retail=초록은 오래 쓰인 조합이라 회사가 더
 * 늘어도 바뀌면 안 된다.
 *
 * 새 법인을 여기 넣지 않아도 slug 해시로 팔레트 색이 하나 배정되므로
 * **회색으로 묻히지 않는다.** 색을 지정하고 싶을 때만 한 줄 추가하면 된다.
 */
const PINNED_COMPANY_COLORS: Record<string, number> = {
  korea: 0,
  retail: 1,
  hoi: 2,
  partners: 3,
};

/** slug → 팔레트 인덱스. 같은 slug면 항상 같은 색이 나온다. */
function paletteIndexFor(slug: string): number {
  const pinned = PINNED_COMPANY_COLORS[slug];
  if (pinned !== undefined) return pinned % COMPANY_BADGE_PALETTE.length;

  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % COMPANY_BADGE_PALETTE.length;
}

/** 배지 바깥에서도 같은 색을 쓰고 싶을 때 (예: 드롭다운 트리거). */
export function companyBadgeStyle(slug: string | null | undefined): string {
  if (!slug) return "bg-[rgba(142,142,147,0.1)] text-[var(--apple-secondary-label)]";
  return COMPANY_BADGE_PALETTE[paletteIndexFor(slug)];
}

export function CompanyBadge({
  name,
  slug,
  className,
}: {
  name: string;
  slug: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap",
        companyBadgeStyle(slug),
        className,
      )}
    >
      {name}
    </span>
  );
}
