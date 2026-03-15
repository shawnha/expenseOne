// ---------------------------------------------------------------------------
// Slack Bot API Service — #99-expenses 채널 멘션 알림
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  ODD: "ODD",
  MART_PHARMACY: "마트/약국",
  OTHER: "기타",
};

export function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

// ---------------------------------------------------------------------------
// Slack user lookup cache (email → Slack user ID)
// ---------------------------------------------------------------------------
const slackUserCache = new Map<string, string | null>();

async function lookupSlackUserByEmail(email: string): Promise<string | null> {
  if (slackUserCache.has(email)) {
    return slackUserCache.get(email) ?? null;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json();

    if (data.ok && data.user?.id) {
      slackUserCache.set(email, data.user.id);
      return data.user.id;
    }

    slackUserCache.set(email, null);
    return null;
  } catch (err) {
    console.error(`[Slack] users.lookupByEmail 실패 (${email}):`, err);
    slackUserCache.set(email, null);
    return null;
  }
}

async function mentionUser(email: string, fallbackName: string): Promise<string> {
  const slackId = await lookupSlackUserByEmail(email);
  return slackId ? `<@${slackId}>` : fallbackName;
}

// ---------------------------------------------------------------------------
// Send message to #99-expenses channel via chat.postMessage
// ---------------------------------------------------------------------------
async function sendSlackMessage(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!token || !channel) {
    console.log("[Slack] SLACK_BOT_TOKEN 또는 SLACK_CHANNEL_ID가 설정되지 않았습니다.");
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
}): Promise<void> {
  const mention = await mentionUser(params.submitterEmail, params.submitterName);

  const text = [
    `💳 ${mention} 법카사용이 등록되었습니다`,
    `• 제목: ${params.title}`,
    `• 금액: ${formatKRW(params.amount)}`,
    `• 카테고리: ${getCategoryLabel(params.category)}`,
    `<${params.expenseUrl}|상세 보기>`,
  ].join("\n");

  await sendSlackMessage(text);
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
}): Promise<void> {
  const mention = await mentionUser(params.submitterEmail, params.submitterName);

  const text = [
    `✅ ${mention} 입금요청이 완료되었습니다`,
    `• 제목: ${params.title}`,
    `• 금액: ${formatKRW(params.amount)}`,
    `<${params.expenseUrl}|상세 보기>`,
  ].join("\n");

  await sendSlackMessage(text);
}
