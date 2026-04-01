// ---------------------------------------------------------------------------
// Slack Bot API Service — #99-expenses 채널 멘션 알림
// ---------------------------------------------------------------------------

import { formatKRW, getCategoryLabel } from "@/lib/utils/expense-utils";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Slack user lookup cache (email → Slack user ID) with 1-hour TTL
// ---------------------------------------------------------------------------
interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const slackUserCache = new Map<string, CacheEntry>();

async function lookupSlackUserByEmail(email: string): Promise<string | null> {
  const cached = slackUserCache.get(email);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }
  // Remove expired entry
  if (cached) slackUserCache.delete(email);

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json();

    if (data.ok && data.user?.id) {
      slackUserCache.set(email, { value: data.user.id, expiresAt: Date.now() + CACHE_TTL_MS });
      return data.user.id;
    }

    slackUserCache.set(email, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  } catch (err) {
    console.error(`[Slack] users.lookupByEmail 실패 (${email}):`, err);
    slackUserCache.set(email, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }
}

async function mentionUser(email: string, fallbackName: string): Promise<string> {
  const slackId = await lookupSlackUserByEmail(email);
  return slackId ? `<@${slackId}>` : fallbackName;
}

// ---------------------------------------------------------------------------
// Look up Slack channel by company (falls back to env var)
// ---------------------------------------------------------------------------
async function getSlackChannelForCompany(companyId?: string | null): Promise<string | null> {
  if (companyId) {
    const [company] = await db
      .select({ slackChannelId: companies.slackChannelId })
      .from(companies)
      .where(eq(companies.id, companyId));
    if (company?.slackChannelId) return company.slackChannelId;
  }
  return process.env.SLACK_CHANNEL_ID || null;
}

// ---------------------------------------------------------------------------
// Send message to Slack channel via chat.postMessage
// ---------------------------------------------------------------------------
async function sendSlackMessage(text: string, companyId?: string | null): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = await getSlackChannelForCompany(companyId);

  if (!token || !channel) {
    console.warn(`[Slack] SLACK_BOT_TOKEN 또는 채널이 설정되지 않았습니다. (companyId: ${companyId ?? "none"})`);
    return;
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text, username: "ExpenseOne", icon_emoji: ":money_with_wings:" }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error(`[Slack] chat.postMessage 실패: ${data.error}`);
    }
  } catch (err) {
    console.error("[Slack] chat.postMessage 전송 중 오류:", err);
  }
}

// ---------------------------------------------------------------------------
// Helper: look up company name by ID
// ---------------------------------------------------------------------------
async function getCompanyName(companyId?: string | null): Promise<string | null> {
  if (!companyId) return null;
  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId));
  return company?.name ?? null;
}

// ---------------------------------------------------------------------------
// Public notification functions
// ---------------------------------------------------------------------------

/**
 * 법카사용 등록 → 제출자 멘션
 */
export async function notifySlackCorporateCard(params: {
  submitterEmail: string;
  submitterName: string;
  title: string;
  amount: number;
  category: string;
  expenseUrl: string;
  companyId?: string;
}): Promise<void> {
  const [mention, companyName] = await Promise.all([
    mentionUser(params.submitterEmail, params.submitterName),
    getCompanyName(params.companyId),
  ]);

  const lines = [
    `💳 ${mention} 법카사용이 등록되었습니다`,
  ];
  if (companyName) lines.push(`• 회사: ${companyName}`);
  lines.push(
    `• 제목: ${params.title}`,
    `• 금액: ${formatKRW(params.amount)}`,
    `• 카테고리: ${getCategoryLabel(params.category)}`,
    `<${params.expenseUrl}|상세 보기>`,
  );

  await sendSlackMessage(lines.join("\n"), params.companyId);
}

/**
 * 입금요청 승인 → 요청자 멘션
 */
export async function notifySlackApproved(params: {
  submitterEmail: string;
  submitterName: string;
  approverName: string;
  title: string;
  amount: number;
  expenseUrl: string;
  companyId?: string;
}): Promise<void> {
  const [mention, companyName] = await Promise.all([
    mentionUser(params.submitterEmail, params.submitterName),
    getCompanyName(params.companyId),
  ]);

  const lines = [
    `✅ ${mention} 입금요청이 완료되었습니다`,
  ];
  if (companyName) lines.push(`• 회사: ${companyName}`);
  lines.push(
    `• 제목: ${params.title}`,
    `• 금액: ${formatKRW(params.amount)}`,
    `<${params.expenseUrl}|상세 보기>`,
  );

  await sendSlackMessage(lines.join("\n"), params.companyId);
}
