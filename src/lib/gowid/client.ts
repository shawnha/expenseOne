const GOWID_BASE_URL = "https://openapi.gowid.com";

// Multi-company GoWid API keys
export interface GowidCompanyConfig {
  apiKey: string;
  companySlug: string;
  companyId?: string;
}

/** 규칙: `GOWID_API_KEY_<SLUG 대문자>` → 그 회사의 법카 계정. */
const GOWID_KEY_PREFIX = "GOWID_API_KEY_";

/**
 * 동기화할 GoWid 계정 목록을 환경변수에서 읽는다.
 *
 * 법인이 늘어날 때 **코드를 고치지 않아도 되도록** 회사 slug를 하드코딩하지
 * 않고 환경변수 이름 규칙으로 찾는다. 예: 한아원파트너스(slug `partners`)는
 * `GOWID_API_KEY_PARTNERS` 하나만 Vercel에 넣으면 다음 동기화부터 포함된다.
 *
 * 코리아만 예외다. 단일 법인 시절부터 쓰던 이름이라 접미사가 없다. 기존
 * 환경변수를 그대로 살리기 위해 `GOWID_API_KEY`를 우선 보고, 나중에 규칙대로
 * 이름을 바꾸더라도 깨지지 않게 `GOWID_API_KEY_KOREA`도 받는다.
 *
 * 여기서는 slug가 실제 회사인지 검증하지 않는다(DB 접근이 없다). 매칭되는
 * 회사가 없어도 **거래는 그대로 스테이징된다** — 회사 미지정으로 남겨
 * /admin/gowid에서 고칠 수 있는 편이 아예 안 보이는 것보다 낫기 때문이다.
 * syncGowidTransactions가 경고를 남기고, /admin/companies가 그런 환경변수
 * 이름을 배너로 드러낸다. (건너뛰지 않는다는 점에 주의)
 *
 * slug에 하이픈이 없어야 이 되돌리기가 맞는다 — validations/company.ts에서
 * 영숫자만 허용하는 이유다.
 */
export function getGowidConfigs(): GowidCompanyConfig[] {
  const configs: GowidCompanyConfig[] = [];
  const seen = new Set<string>();

  const koreaLegacy = process.env.GOWID_API_KEY;
  const koreaConvention = process.env[`${GOWID_KEY_PREFIX}KOREA`];
  // 이름을 규칙대로 바꿀 땐 둘 다 세팅한 상태를 거치게 된다. 그때 접미사 없는
  // 쪽이 조용히 이기면, 새로 넣은 키가 무시된 걸 아무도 모른 채 옛 키를 계속
  // 쓴다(교체 직후 폐기되면 그때 터진다). 값이 다르면 드러낸다.
  if (koreaLegacy && koreaConvention && koreaLegacy !== koreaConvention) {
    console.warn(
      "[gowid] GOWID_API_KEY와 GOWID_API_KEY_KOREA가 둘 다 설정됐고 값이 다릅니다. " +
        "GOWID_API_KEY를 사용합니다. 교체 중이라면 옛 변수를 지우세요.",
    );
  }
  const koreaKey = koreaLegacy ?? koreaConvention;
  if (koreaKey) {
    configs.push({ apiKey: koreaKey, companySlug: "korea" });
    seen.add("korea");
  }

  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith(GOWID_KEY_PREFIX) || !value) continue;
    const slug = name.slice(GOWID_KEY_PREFIX.length).toLowerCase();
    if (seen.has(slug)) continue;
    configs.push({ apiKey: value, companySlug: slug });
    seen.add(slug);
  }

  return configs;
}

async function gowidFetch<T>(path: string, apiKey: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GOWID_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GoWid API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.result?.code !== 20000000) {
    throw new Error(`GoWid API error: ${json.result?.desc ?? "unknown"}`);
  }

  return json.data as T;
}

export interface GowidMember {
  userId: number;
  userName: string;
  email: string;
  isContractor: boolean;
  status: string;
  position: string;
  role: { type: string; name: string };
}

export interface GowidExpenseListItem {
  expenseId: number;
  expenseDate: string;       // YYYYMMDD
  expenseTime: string;       // HHMMSS
  useAmount: number;
  currency: string;
  krwAmount: number;
  approvalStatus: string;
  cardAlias: string | null;
  shortCardNumber: string;   // "롯데 9884"
  storeName: string;
  storeAddress: string;
  memo: string | null;
}

export interface GowidExpenseDetail extends GowidExpenseListItem {
  cardApprovalNumber: string;
  card: {
    cardNumber: string;
    cardType: string;
    cardName: string;
    alias: string | null;
  };
  isDomestic: boolean;
}

interface GowidPaginatedResponse<T> {
  totalPages: number;
  totalElements: number;
  last: boolean;
  content: T[];
}

export async function fetchGowidMembers(apiKey: string): Promise<GowidMember[]> {
  return gowidFetch<GowidMember[]>("/v1/members", apiKey);
}

export async function fetchGowidNotSubmitted(
  apiKey: string,
  page = 0,
  size = 100,
): Promise<GowidPaginatedResponse<GowidExpenseListItem>> {
  return gowidFetch<GowidPaginatedResponse<GowidExpenseListItem>>(
    `/v1/expenses/not-submitted?page=${page}&size=${size}`, apiKey,
  );
}

export async function fetchGowidExpenses(
  apiKey: string,
  page = 0,
  size = 100,
): Promise<GowidPaginatedResponse<GowidExpenseListItem>> {
  return gowidFetch<GowidPaginatedResponse<GowidExpenseListItem>>(
    `/v1/expenses?page=${page}&size=${size}`, apiKey,
  );
}

export async function fetchGowidExpenseDetail(
  apiKey: string,
  expenseId: number,
): Promise<GowidExpenseDetail> {
  return gowidFetch<GowidExpenseDetail>(`/v1/expenses/${expenseId}`, apiKey);
}

export function extractCardLastFour(shortCardNumber: string): string {
  const match = shortCardNumber.match(/(\d{4})$/);
  return match ? match[1] : shortCardNumber.slice(-4);
}

/**
 * Extract the issuing bank from GoWid's shortCardNumber. The format is
 * "<issuer> <digits>", e.g. "롯데 9884" or "우리 1234". Returns null when
 * we can't recognize the prefix so callers can decide how to handle it.
 *
 * The prefix list isn't exhaustive — new issuers picked up by GoWid will
 * just get the raw prefix returned, which the admin can clean up via the
 * card-management UI. We only normalize the canonical names here.
 */
export function extractCardIssuer(shortCardNumber: string): string | null {
  const trimmed = shortCardNumber.trim();
  if (!trimmed) return null;

  // Pull off the trailing digits and use whatever's left as the issuer.
  const stripped = trimmed.replace(/\s*\d+$/, "").trim();
  if (!stripped) return null;

  // Normalize a few common forms so "롯데카드" / "롯데" / "lotte" all map
  // to the same group.
  const lower = stripped.toLowerCase();
  if (/롯데|lotte/.test(lower)) return "롯데";
  if (/우리|woori/.test(lower)) return "우리";
  if (/신한|shinhan/.test(lower)) return "신한";
  if (/국민|kookmin|kb/.test(lower)) return "국민";
  if (/하나|hana/.test(lower)) return "하나";
  if (/현대|hyundai/.test(lower)) return "현대";
  if (/삼성|samsung/.test(lower)) return "삼성";
  if (/비씨|bc/.test(lower)) return "BC";
  if (/nh|농협/.test(lower)) return "NH";

  // Unknown issuer — return the raw prefix so it's at least visible in
  // the UI as its own group.
  return stripped;
}
