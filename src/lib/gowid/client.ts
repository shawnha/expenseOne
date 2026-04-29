const GOWID_BASE_URL = "https://openapi.gowid.com";

// Multi-company GoWid API keys
export interface GowidCompanyConfig {
  apiKey: string;
  companySlug: string;
  companyId?: string;
}

export function getGowidConfigs(): GowidCompanyConfig[] {
  const configs: GowidCompanyConfig[] = [];
  const koreaKey = process.env.GOWID_API_KEY;
  if (koreaKey) configs.push({ apiKey: koreaKey, companySlug: "korea" });
  const retailKey = process.env.GOWID_API_KEY_RETAIL;
  if (retailKey) configs.push({ apiKey: retailKey, companySlug: "retail" });
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
