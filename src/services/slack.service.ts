// ---------------------------------------------------------------------------
// Slack Bot API Service — #99-expenses 채널 멘션 알림
// ---------------------------------------------------------------------------

import { getCategoryLabel, formatExpenseAmount } from "@/lib/utils/expense-utils";
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
async function sendSlackMessage(text: string, companyId?: string | null): Promise<{ ts: string; channel: string } | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = await getSlackChannelForCompany(companyId);

  if (!token || !channel) {
    console.warn(`[Slack] SLACK_BOT_TOKEN 또는 채널이 설정되지 않았습니다. (companyId: ${companyId ?? "none"})`);
    return null;
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
      return null;
    }
    return { ts: data.ts, channel: data.channel ?? channel };
  } catch (err) {
    console.error("[Slack] chat.postMessage 전송 중 오류:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Delete existing Slack message via chat.delete
// ---------------------------------------------------------------------------
async function deleteSlackMessage(channel: string, ts: string): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch("https://slack.com/api/chat.delete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, ts }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error(`[Slack] chat.delete 실패: ${data.error}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Slack] chat.delete 오류:", err);
    return false;
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
  currency?: string | null;
  amountOriginal?: number | null;
  merchantName?: string | null;
  description?: string | null;
}): Promise<{ ts: string; channel: string } | null> {
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
    `• 금액: ${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)}`,
    `• 카테고리: ${getCategoryLabel(params.category)}`,
    `• 가맹점명: ${params.merchantName ?? "-"}`,
  );
  if (params.description && params.description.trim()) {
    const memo = params.description.trim();
    lines.push(`• 설명: ${memo.length > 500 ? memo.slice(0, 500) + "..." : memo}`);
  }
  lines.push(`<${params.expenseUrl}|상세 보기>`);

  return sendSlackMessage(lines.join("\n"), params.companyId);
}

/**
 * 입금요청 제출 → 제출자 멘션 + 상세 정보
 */
export async function notifySlackDepositRequest(params: {
  submitterEmail: string;
  submitterName: string;
  title: string;
  amount: number;
  category: string;
  expenseUrl: string;
  companyId?: string;
  currency?: string | null;
  amountOriginal?: number | null;
  dueDate?: string | null;
  isUrgent?: boolean;
  description?: string | null;
}): Promise<{ ts: string; channel: string } | null> {
  const [mention, companyName] = await Promise.all([
    mentionUser(params.submitterEmail, params.submitterName),
    getCompanyName(params.companyId),
  ]);

  const urgentPrefix = params.isUrgent ? "🚨 " : "";
  const lines = [
    `${urgentPrefix}💸 ${mention} 새 입금요청이 등록되었습니다`,
  ];
  if (companyName) lines.push(`• 회사: ${companyName}`);
  lines.push(
    `• 제목: ${params.title}`,
    `• 금액: ${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)}`,
    `• 카테고리: ${getCategoryLabel(params.category)}`,
  );
  if (params.dueDate) {
    // Format YYYY-MM-DD → YYYY.MM.DD
    const formatted = params.dueDate.replace(/-/g, ".");
    lines.push(`• 납입 기일: ${formatted}`);
  }
  if (params.isUrgent) {
    lines.push(`• 긴급: 예`);
  }
  if (params.description && params.description.trim()) {
    // Truncate description to 500 chars for Slack readability
    const memo = params.description.trim();
    const truncated = memo.length > 500 ? memo.slice(0, 500) + "..." : memo;
    lines.push(`• 메모: ${truncated}`);
  }
  lines.push(`<${params.expenseUrl}|상세 보기>`);

  return sendSlackMessage(lines.join("\n"), params.companyId);
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
  currency?: string | null;
  amountOriginal?: number | null;
  accountHolder?: string | null;
  isUrgent?: boolean;
  dueDate?: string | null;
  description?: string | null;
}): Promise<{ ts: string; channel: string } | null> {
  const [mention, companyName] = await Promise.all([
    mentionUser(params.submitterEmail, params.submitterName),
    getCompanyName(params.companyId),
  ]);

  const lines = [
    `✅ ${mention} 입금이 완료되었습니다`,
  ];
  lines.push(`• 회사: ${companyName ?? "-"}`);
  lines.push(
    `• 제목: ${params.title}`,
    `• 금액: ${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)}`,
    `• 예금주: ${params.accountHolder ?? "-"}`,
  );
  if (params.dueDate) {
    lines.push(`• 납부기일: ${params.dueDate.replace(/-/g, ".")}`);
  }
  lines.push(`<${params.expenseUrl}|상세 보기>`);

  return sendSlackMessage(lines.join("\n"), params.companyId);
}

/**
 * 비용 수정 시 기존 Slack 메시지 업데이트
 */
export async function updateSlackExpenseMessage(params: {
  slackMessageTs: string;
  slackChannelId: string;
  submitterEmail: string;
  submitterName: string;
  type: "CORPORATE_CARD" | "DEPOSIT_REQUEST";
  title: string;
  amount: number;
  category: string;
  expenseUrl: string;
  companyId?: string | null;
  currency?: string | null;
  amountOriginal?: number | null;
  merchantName?: string | null;
  description?: string | null;
  dueDate?: string | null;
  isUrgent?: boolean;
}): Promise<{ ts: string; channel: string } | null> {
  // 1. Delete the old message
  await deleteSlackMessage(params.slackChannelId, params.slackMessageTs);

  // 2. Post a new message with updated content
  const [mention, companyName] = await Promise.all([
    mentionUser(params.submitterEmail, params.submitterName),
    getCompanyName(params.companyId),
  ]);

  const isCorporateCard = params.type === "CORPORATE_CARD";
  const urgentPrefix = params.isUrgent ? "🚨 " : "";
  const emoji = isCorporateCard ? "💳" : "💸";
  const typeLabel = isCorporateCard ? "법카사용이 수정되었습니다" : "입금요청이 수정되었습니다";

  const lines = [`${urgentPrefix}${emoji} ${mention} ${typeLabel}`];
  if (companyName) lines.push(`• 회사: ${companyName}`);
  lines.push(
    `• 제목: ${params.title}`,
    `• 금액: ${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)}`,
    `• 카테고리: ${getCategoryLabel(params.category)}`,
  );
  if (isCorporateCard && params.merchantName) {
    lines.push(`• 가맹점명: ${params.merchantName}`);
  }
  if (!isCorporateCard && params.dueDate) {
    lines.push(`• 납입 기일: ${params.dueDate.replace(/-/g, ".")}`);
  }
  if (params.description?.trim()) {
    const memo = params.description.trim();
    lines.push(`• 메모: ${memo.length > 500 ? memo.slice(0, 500) + "..." : memo}`);
  }
  lines.push(`<${params.expenseUrl}|상세 보기>`);

  return sendSlackMessage(lines.join("\n"), params.companyId);
}

/**
 * 비용 취소/삭제 시 Slack 메시지 삭제
 */
export async function deleteSlackExpenseMessage(channel: string, ts: string): Promise<boolean> {
  return deleteSlackMessage(channel, ts);
}
