const GOWID_BASE_URL = "https://openapi.gowid.com";

function getApiKey(): string {
  const key = process.env.GOWID_API_KEY;
  if (!key) throw new Error("GOWID_API_KEY is not set");
  return key;
}

async function gowidFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GOWID_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: getApiKey(),
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

export async function fetchGowidMembers(): Promise<GowidMember[]> {
  return gowidFetch<GowidMember[]>("/v1/members");
}

export async function fetchGowidNotSubmitted(
  page = 0,
  size = 100,
): Promise<GowidPaginatedResponse<GowidExpenseListItem>> {
  return gowidFetch<GowidPaginatedResponse<GowidExpenseListItem>>(
    `/v1/expenses/not-submitted?page=${page}&size=${size}`,
  );
}

export async function fetchGowidExpenseDetail(
  expenseId: number,
): Promise<GowidExpenseDetail> {
  return gowidFetch<GowidExpenseDetail>(`/v1/expenses/${expenseId}`);
}

export function extractCardLastFour(shortCardNumber: string): string {
  const match = shortCardNumber.match(/(\d{4})$/);
  return match ? match[1] : shortCardNumber.slice(-4);
}
