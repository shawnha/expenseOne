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
