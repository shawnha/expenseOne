// ---------------------------------------------------------------------------
// Slack Bot API Service — #99-expenses 채널 멘션 알림
//
// 한 비용은 최대 두 곳에 게시된다:
//  - primary: 코리아 워크스페이스(Hanah One Co.) 채널. 회사별 slackChannelId가
//    있으면 그것을, 없으면 SLACK_CHANNEL_ID로 폴백.
//  - mirror:  회사 slug로 만든 환경변수(SLACK_BOT_TOKEN_<SLUG> +
//    SLACK_CHANNEL_ID_<SLUG>)가 채워져 있으면 그 회사의 *별도 워크스페이스*
//    채널에도 같은 내용을 게시. 리테일은 코리아와 다른 Slack 워크스페이스라
//    봇 토큰이 따로 필요하다.
// 미러 전송 실패는 원본 게시에 영향을 주지 않는다(로그만 남김).
// ---------------------------------------------------------------------------

import { getCategoryLabel, formatExpenseAmount } from "@/lib/utils/expense-utils";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Mirror 설정 — 회사 slug에서 환경변수 이름을 규칙으로 만든다.
//   slug "retail" → SLACK_BOT_TOKEN_RETAIL + SLACK_CHANNEL_ID_RETAIL
//
// 법인이 늘어날 때 **코드를 고치지 않아도 되도록** slug 목록을 하드코딩하지
// 않는다. 새 법인은 환경변수 2개만 넣으면 미러가 켜지고, 빼면 꺼진다.
// 둘 중 하나라도 비어 있으면 조용히 건너뛰므로 토큰 발급 전에 배포해도 안전하다.
//
// 코리아는 primary 워크스페이스다. 접미사 없는 SLACK_BOT_TOKEN을 쓰므로
// SLACK_BOT_TOKEN_KOREA를 만들지 않는 한 자기 자신에게 미러되지 않는다.
// ---------------------------------------------------------------------------
const MIRROR_TOKEN_PREFIX = "SLACK_BOT_TOKEN_";
const MIRROR_CHANNEL_PREFIX = "SLACK_CHANNEL_ID_";

/** slug(소문자 영숫자) → 환경변수 접미사(대문자). */
function toEnvSuffix(slug: string): string {
  return slug.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/** 하나의 전송 대상. key는 사용자 조회 캐시를 워크스페이스별로 분리하는 용도. */
interface SlackTarget {
  key: string;
  token: string;
  channel: string;
}

/** 게시된 메시지의 좌표. 수정/삭제 시 이 값으로 원본을 찾는다. */
export interface SlackMessageRef {
  ts: string;
  channel: string;
}

export interface SlackPostResult {
  primary: SlackMessageRef | null;
  mirror: SlackMessageRef | null;
}

// ---------------------------------------------------------------------------
// Slack user lookup cache (workspace + email → Slack user ID) with 1-hour TTL
//
// 캐시 키에 워크스페이스 key가 반드시 들어가야 한다. email만으로 캐싱하면
// 코리아 워크스페이스에서 조회한 user ID가 리테일 메시지에 쓰여 멘션이 깨진다.
// ---------------------------------------------------------------------------
interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const slackUserCache = new Map<string, CacheEntry>();

async function lookupSlackUserByEmail(
  target: SlackTarget,
  email: string,
): Promise<string | null> {
  const cacheKey = `${target.key}:${email}`;
  const cached = slackUserCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }
  // Remove expired entry
  if (cached) slackUserCache.delete(cacheKey);

  try {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${target.token}` } },
    );
    const data = await res.json();

    if (data.ok && data.user?.id) {
      slackUserCache.set(cacheKey, {
        value: data.user.id,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return data.user.id;
    }

    slackUserCache.set(cacheKey, {
      value: null,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return null;
  } catch (err) {
    console.error(`[Slack] users.lookupByEmail 실패 (${target.key}/${email}):`, err);
    slackUserCache.set(cacheKey, {
      value: null,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return null;
  }
}

/**
 * 해당 워크스페이스에서의 멘션 문자열. 그 워크스페이스에 없는 사용자면
 * 이름 텍스트로 폴백한다 (리테일 워크스페이스에 계정이 없는 코리아 직원 등).
 */
async function mentionUser(
  target: SlackTarget,
  email: string,
  fallbackName: string,
): Promise<string> {
  const slackId = await lookupSlackUserByEmail(target, email);
  return slackId ? `<@${slackId}>` : fallbackName;
}

// ---------------------------------------------------------------------------
// 회사 기준으로 primary / mirror 전송 대상 확정
// ---------------------------------------------------------------------------
async function resolveTargets(
  companyId?: string | null,
): Promise<{ primary: SlackTarget | null; mirror: SlackTarget | null }> {
  let companyChannel: string | null = null;
  let slug: string | null = null;

  if (companyId) {
    const [company] = await db
      .select({ slackChannelId: companies.slackChannelId, slug: companies.slug })
      .from(companies)
      .where(eq(companies.id, companyId));
    companyChannel = company?.slackChannelId ?? null;
    slug = company?.slug ?? null;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = companyChannel ?? process.env.SLACK_CHANNEL_ID ?? null;
  const primary: SlackTarget | null =
    token && channel ? { key: "default", token, channel } : null;

  let mirror: SlackTarget | null = null;
  if (slug) {
    const suffix = toEnvSuffix(slug);
    const mirrorToken = process.env[`${MIRROR_TOKEN_PREFIX}${suffix}`];
    const mirrorChannel = process.env[`${MIRROR_CHANNEL_PREFIX}${suffix}`];
    if (mirrorToken && mirrorChannel) {
      mirror = { key: slug, token: mirrorToken, channel: mirrorChannel };
    }
  }

  return { primary, mirror };
}

/**
 * 이미 게시된 미러 메시지를 지우기 위한 대상 확정.
 *
 * 회사를 리테일 → 코리아로 바꾼 수정처럼 새 회사에 미러 대상이 없는 경우,
 * resolveTargets는 mirror=null을 주므로 예전 워크스페이스에 게시된 메시지를
 * 지울 토큰을 찾지 못한다. 저장된 채널 ID로 역방향 조회해서 해당 워크스페이스
 * 토큰을 찾는다.
 */
function resolveMirrorTargetByChannel(channelId: string): SlackTarget | null {
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith(MIRROR_CHANNEL_PREFIX) || value !== channelId) continue;
    const suffix = name.slice(MIRROR_CHANNEL_PREFIX.length);
    const token = process.env[`${MIRROR_TOKEN_PREFIX}${suffix}`];
    if (token) return { key: suffix.toLowerCase(), token, channel: channelId };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 저수준 전송 / 삭제
// ---------------------------------------------------------------------------
async function postMessage(
  target: SlackTarget,
  text: string,
): Promise<SlackMessageRef | null> {
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: target.channel,
        text,
        username: "ExpenseOne",
        icon_emoji: ":money_with_wings:",
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error(`[Slack:${target.key}] chat.postMessage 실패: ${data.error}`);
      return null;
    }
    return { ts: data.ts, channel: data.channel ?? target.channel };
  } catch (err) {
    console.error(`[Slack:${target.key}] chat.postMessage 전송 중 오류:`, err);
    return null;
  }
}

async function deleteMessage(
  token: string,
  channel: string,
  ts: string,
  label: string,
): Promise<boolean> {
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
      console.error(`[Slack:${label}] chat.delete 실패: ${data.error}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Slack:${label}] chat.delete 오류:`, err);
    return false;
  }
}

/**
 * 이미 게시된 메시지(primary + mirror)를 지운다. 저장된 좌표만 사용하므로
 * 그 사이 회사가 바뀌었어도 원래 게시된 곳에서 정확히 삭제된다.
 */
async function deletePostedMessages(params: {
  slackMessageTs: string | null;
  slackChannelId: string | null;
  mirrorSlackMessageTs: string | null;
  mirrorSlackChannelId: string | null;
}): Promise<void> {
  const tasks: Promise<boolean>[] = [];

  const token = process.env.SLACK_BOT_TOKEN;
  if (token && params.slackMessageTs && params.slackChannelId) {
    tasks.push(
      deleteMessage(token, params.slackChannelId, params.slackMessageTs, "default"),
    );
  }

  if (params.mirrorSlackMessageTs && params.mirrorSlackChannelId) {
    const target = resolveMirrorTargetByChannel(params.mirrorSlackChannelId);
    if (target) {
      tasks.push(
        deleteMessage(
          target.token,
          params.mirrorSlackChannelId,
          params.mirrorSlackMessageTs,
          target.key,
        ),
      );
    }
  }

  await Promise.allSettled(tasks);
}

/**
 * primary + mirror에 각각 게시한다.
 *
 * buildText가 멘션 문자열을 받는 이유: 워크스페이스마다 같은 사람의 Slack
 * user ID가 다르므로 메시지 본문을 대상별로 따로 만들어야 한다.
 */
async function sendToTargets(params: {
  companyId?: string | null;
  submitterEmail: string;
  submitterName: string;
  buildText: (mention: string) => string;
}): Promise<SlackPostResult> {
  const { primary, mirror } = await resolveTargets(params.companyId);

  if (!primary && !mirror) {
    console.warn(
      `[Slack] 전송 대상이 없습니다 (companyId: ${params.companyId ?? "none"})`,
    );
    return { primary: null, mirror: null };
  }

  const send = async (target: SlackTarget | null) => {
    if (!target) return null;
    const mention = await mentionUser(
      target,
      params.submitterEmail,
      params.submitterName,
    );
    return postMessage(target, params.buildText(mention));
  };

  // 미러 실패가 원본 게시를 막지 않도록 allSettled
  const [primaryResult, mirrorResult] = await Promise.allSettled([
    send(primary),
    send(mirror),
  ]);

  if (mirrorResult.status === "rejected") {
    console.error("[Slack] 미러 게시 실패:", mirrorResult.reason);
  }

  return {
    primary: primaryResult.status === "fulfilled" ? primaryResult.value : null,
    mirror: mirrorResult.status === "fulfilled" ? mirrorResult.value : null,
  };
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
}): Promise<SlackPostResult> {
  const companyName = await getCompanyName(params.companyId);

  return sendToTargets({
    companyId: params.companyId,
    submitterEmail: params.submitterEmail,
    submitterName: params.submitterName,
    buildText: (mention) => {
      const lines = [`💳 ${mention} 법카사용이 등록되었습니다`];
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
      return lines.join("\n");
    },
  });
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
  isPrePaid?: boolean;
  prePaidPercentage?: number | null;
  description?: string | null;
}): Promise<SlackPostResult> {
  const companyName = await getCompanyName(params.companyId);

  return sendToTargets({
    companyId: params.companyId,
    submitterEmail: params.submitterEmail,
    submitterName: params.submitterName,
    buildText: (mention) => {
      const urgentPrefix = params.isUrgent ? "🚨 " : "";
      const lines = [`${urgentPrefix}💸 ${mention} 새 입금요청이 등록되었습니다`];
      if (companyName) lines.push(`• 회사: ${companyName}`);
      lines.push(
        `• 제목: ${params.title}`,
        `• 금액: ${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)}`,
        `• 카테고리: ${getCategoryLabel(params.category)}`,
      );
      if (params.dueDate) {
        // Format YYYY-MM-DD → YYYY.MM.DD
        lines.push(`• 납입 기일: ${params.dueDate.replace(/-/g, ".")}`);
      }
      if (params.isUrgent) {
        lines.push(`• 긴급: 예`);
      }
      if (params.isPrePaid) {
        const pct = params.prePaidPercentage;
        lines.push(pct != null && pct < 100 ? `• 선지급: 예 (${pct}%)` : `• 선지급: 예`);
      }
      if (params.description && params.description.trim()) {
        // Truncate description to 500 chars for Slack readability
        const memo = params.description.trim();
        lines.push(`• 메모: ${memo.length > 500 ? memo.slice(0, 500) + "..." : memo}`);
      }
      lines.push(`<${params.expenseUrl}|상세 보기>`);
      return lines.join("\n");
    },
  });
}

/**
 * 반품/환불 등록 → 제출자 멘션 + 원거래 정보. 금액은 차감(-)으로 표시.
 */
export async function notifySlackRefund(params: {
  submitterEmail: string;
  submitterName: string;
  title: string;
  amount: number;
  category: string;
  expenseUrl: string;
  originalTitle: string;
  companyId?: string;
  currency?: string | null;
  amountOriginal?: number | null;
  description?: string | null;
}): Promise<SlackPostResult> {
  const companyName = await getCompanyName(params.companyId);

  return sendToTargets({
    companyId: params.companyId,
    submitterEmail: params.submitterEmail,
    submitterName: params.submitterName,
    buildText: (mention) => {
      const lines = [`↩️ ${mention} 반품/환불이 등록되었습니다`];
      if (companyName) lines.push(`• 회사: ${companyName}`);
      lines.push(
        `• 원거래: ${params.originalTitle}`,
        `• 환불 금액: -${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)}`,
        `• 카테고리: ${getCategoryLabel(params.category)}`,
      );
      if (params.description && params.description.trim()) {
        const memo = params.description.trim();
        lines.push(`• 사유: ${memo.length > 500 ? memo.slice(0, 500) + "..." : memo}`);
      }
      lines.push(`<${params.expenseUrl}|상세 보기>`);
      return lines.join("\n");
    },
  });
}

/**
 * 후지급 요청 → 제출자 멘션 + 선지급/후지급 금액. 관리자 승인이 필요한 액션.
 */
export async function notifySlackRemainingPaymentRequest(params: {
  submitterEmail: string;
  submitterName: string;
  title: string;
  amount: number;
  prePaidPercentage: number;
  expenseUrl: string;
  companyId?: string;
  currency?: string | null;
  amountOriginal?: number | null;
  dueDate?: string | null;
}): Promise<SlackPostResult> {
  const companyName = await getCompanyName(params.companyId);

  const prePaidAmount = Math.round((params.amount * params.prePaidPercentage) / 100);
  const remainingAmount = params.amount - prePaidAmount;

  return sendToTargets({
    companyId: params.companyId,
    submitterEmail: params.submitterEmail,
    submitterName: params.submitterName,
    buildText: (mention) => {
      const lines = [`🔔 ${mention} 후지급 요청이 등록되었습니다`];
      if (companyName) lines.push(`• 회사: ${companyName}`);
      lines.push(
        `• 제목: ${params.title}`,
        `• 총 금액: ${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)}`,
        `• 선지급 완료 (${params.prePaidPercentage}%): ${prePaidAmount.toLocaleString("ko-KR")}원`,
        `• 후지급 요청액 (${100 - params.prePaidPercentage}%): *${remainingAmount.toLocaleString("ko-KR")}원*`,
      );
      if (params.dueDate) {
        lines.push(`• 납입 기일: ${params.dueDate.replace(/-/g, ".")}`);
      }
      lines.push(`<${params.expenseUrl}|상세 보기>`);
      return lines.join("\n");
    },
  });
}

/**
 * 후지급 승인 → 요청자 멘션 + 실제 지급할 잔금.
 * 요청 알림(notifySlackRemainingPaymentRequest)과 짝을 이룬다.
 */
export async function notifySlackRemainingPaymentApproved(params: {
  submitterEmail: string;
  submitterName: string;
  title: string;
  amount: number;
  prePaidPercentage: number;
  expenseUrl: string;
  companyId?: string | null;
  currency?: string | null;
  amountOriginal?: number | null;
  accountHolder?: string | null;
  dueDate?: string | null;
}): Promise<SlackPostResult> {
  const companyName = await getCompanyName(params.companyId);

  const prePaidAmount = Math.round((params.amount * params.prePaidPercentage) / 100);
  const remainingAmount = params.amount - prePaidAmount;

  return sendToTargets({
    companyId: params.companyId,
    submitterEmail: params.submitterEmail,
    submitterName: params.submitterName,
    buildText: (mention) => {
      const lines = [`✅ ${mention} 후지급이 승인되었습니다`];
      if (companyName) lines.push(`• 회사: ${companyName}`);
      lines.push(
        `• 제목: ${params.title}`,
        `• 총 금액: ${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)}`,
        `• 선지급 완료 (${params.prePaidPercentage}%): ${prePaidAmount.toLocaleString("ko-KR")}원`,
        `• 후지급 승인액 (${100 - params.prePaidPercentage}%): *${remainingAmount.toLocaleString("ko-KR")}원*`,
        `• 예금주: ${params.accountHolder ?? "-"}`,
      );
      if (params.dueDate) {
        lines.push(`• 납입 기일: ${params.dueDate.replace(/-/g, ".")}`);
      }
      lines.push(`<${params.expenseUrl}|상세 보기>`);
      return lines.join("\n");
    },
  });
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
  isPrePaid?: boolean;
  prePaidPercentage?: number | null;
}): Promise<SlackPostResult> {
  const companyName = await getCompanyName(params.companyId);

  // 부분 선지급 건은 승인 시점에 실제로 나가는 돈이 총액이 아니라 선지급분이다.
  // 총액을 "• 금액"으로 올리면 Slack만 보고 전액 송금하는 사고가 난다.
  const isPartialPrePaid =
    params.isPrePaid === true &&
    params.prePaidPercentage != null &&
    params.prePaidPercentage < 100;
  const prePaidAmount = isPartialPrePaid
    ? Math.round((params.amount * params.prePaidPercentage!) / 100)
    : params.amount;
  const remainingAmount = params.amount - prePaidAmount;

  return sendToTargets({
    companyId: params.companyId,
    submitterEmail: params.submitterEmail,
    submitterName: params.submitterName,
    buildText: (mention) => {
      const lines = [`✅ ${mention} 입금이 완료되었습니다`];
      lines.push(`• 회사: ${companyName ?? "-"}`);
      lines.push(`• 제목: ${params.title}`);
      if (isPartialPrePaid) {
        lines.push(
          `• 금액: ${formatExpenseAmount(prePaidAmount, params.currency, null)} (선지급 ${params.prePaidPercentage}%)`,
          `• 총 금액: ${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)} (후지급 ${formatExpenseAmount(remainingAmount, params.currency, null)} 예정)`,
        );
      } else {
        lines.push(
          `• 금액: ${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)}`,
        );
      }
      lines.push(`• 예금주: ${params.accountHolder ?? "-"}`);
      if (params.dueDate) {
        lines.push(`• 납부기일: ${params.dueDate.replace(/-/g, ".")}`);
      }
      lines.push(`<${params.expenseUrl}|상세 보기>`);
      return lines.join("\n");
    },
  });
}

/**
 * 승인 번복 → 요청자 멘션. 이미 게시된 '입금 완료' 메시지에 대한 정정 알림.
 */
export async function notifySlackApprovalReverted(params: {
  submitterEmail: string;
  submitterName: string;
  title: string;
  amount: number;
  expenseUrl: string;
  companyId?: string;
  currency?: string | null;
  amountOriginal?: number | null;
}): Promise<SlackPostResult> {
  const companyName = await getCompanyName(params.companyId);

  return sendToTargets({
    companyId: params.companyId,
    submitterEmail: params.submitterEmail,
    submitterName: params.submitterName,
    buildText: (mention) => {
      const lines = [`⚠️ ${mention} 입금요청 승인이 취소되었습니다`];
      if (companyName) lines.push(`• 회사: ${companyName}`);
      lines.push(
        `• 제목: ${params.title}`,
        `• 금액: ${formatExpenseAmount(params.amount, params.currency, params.amountOriginal)}`,
        `• 상태: 승인 대기로 변경`,
      );
      lines.push(`<${params.expenseUrl}|상세 보기>`);
      return lines.join("\n");
    },
  });
}

/**
 * 비용 수정 시 기존 Slack 메시지 업데이트.
 * primary/mirror 각각 기존 메시지를 지우고 새로 게시한다.
 */
export async function updateSlackExpenseMessage(params: {
  slackMessageTs: string | null;
  slackChannelId: string | null;
  mirrorSlackMessageTs: string | null;
  mirrorSlackChannelId: string | null;
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
  isPrePaid?: boolean;
  prePaidPercentage?: number | null;
}): Promise<SlackPostResult> {
  // 1. 기존 메시지 삭제 — 저장된 좌표 기준이므로 회사가 바뀐 수정이어도
  //    예전 워크스페이스에 남은 메시지까지 정확히 제거된다.
  await deletePostedMessages(params);

  // 2. 갱신된 내용으로 재게시
  const companyName = await getCompanyName(params.companyId);
  const isCorporateCard = params.type === "CORPORATE_CARD";

  return sendToTargets({
    companyId: params.companyId,
    submitterEmail: params.submitterEmail,
    submitterName: params.submitterName,
    buildText: (mention) => {
      const urgentPrefix = params.isUrgent ? "🚨 " : "";
      const emoji = isCorporateCard ? "💳" : "💸";
      const typeLabel = isCorporateCard
        ? "법카사용이 수정되었습니다"
        : "입금요청이 수정되었습니다";

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
      if (!isCorporateCard && params.isPrePaid) {
        const pct = params.prePaidPercentage;
        lines.push(pct != null && pct < 100 ? `• 선지급: 예 (${pct}%)` : `• 선지급: 예`);
      }
      if (params.description?.trim()) {
        const memo = params.description.trim();
        lines.push(`• 메모: ${memo.length > 500 ? memo.slice(0, 500) + "..." : memo}`);
      }
      lines.push(`<${params.expenseUrl}|상세 보기>`);
      return lines.join("\n");
    },
  });
}

/**
 * 비용 취소/삭제 시 Slack 메시지 삭제 (primary + mirror 양쪽).
 */
export async function deleteSlackExpenseMessage(params: {
  slackMessageTs: string | null;
  slackChannelId: string | null;
  mirrorSlackMessageTs: string | null;
  mirrorSlackChannelId: string | null;
}): Promise<void> {
  await deletePostedMessages(params);
}
