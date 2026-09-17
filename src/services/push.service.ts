import webpush from "web-push";
import { db } from "@/lib/db";
import { pushSubscriptions, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Configure web-push with VAPID keys
// ---------------------------------------------------------------------------
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:shawn@hanah1.com";

const VAPID_KEYS_PRESENT = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

/**
 * setVapidDetails는 키 형식이 틀리면(길이·base64url 아님·줄바꿈 섞임) **던진다.**
 * 모듈 최상단에서 던지면 이 파일을 import하는 모든 라우트(비용 제출·승인·크론)가
 * 로드 단계에서 통째로 죽는다. 실패하면 로그를 한 번만 남기고 푸시만 끈다.
 * (오류 메시지에는 키 값이 들어가지 않는다 — 길이·형식 설명뿐이다.)
 */
function configureVapid(): boolean {
  if (!VAPID_KEYS_PRESENT) return false;
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    return true;
  } catch (err) {
    console.error(
      "[Push] VAPID 설정 실패 — 이 인스턴스에서는 푸시 전송을 끕니다:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

const VAPID_CONFIGURED = configureVapid();

/**
 * VAPID 키가 없으면 전송을 아예 시도하지 않는다.
 *
 * 키 없이 보내면 구독 엔드포인트마다 실제 네트워크 요청이 나가고 전부 401로
 * 실패한다 — 느리고, 에러 로그만 쌓이고, 성공할 가능성은 0이다.
 * (검증 스크립트를 키 없이 돌릴 때 이 왕복 때문에 몇 분씩 걸렸다.)
 */
function pushDisabled(): boolean {
  if (VAPID_CONFIGURED) return false;
  // 키가 있는데 설정이 실패한 경우는 로드 때 이미 한 번 기록했다 — 호출마다 반복하지 않는다.
  if (!VAPID_KEYS_PRESENT) console.warn("[Push] VAPID 키가 없어 푸시 전송을 건너뜁니다.");
  return true;
}

// ---------------------------------------------------------------------------
// sendPushToUser -- send push notification to all subscriptions of a user
// ---------------------------------------------------------------------------
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  url?: string,
) {
  if (pushDisabled()) return;
  try {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    if (subs.length === 0) return;

    // Convert absolute URL to relative path for SW navigation
    let pushUrl = url || "/";
    try {
      const parsed = new URL(pushUrl);
      pushUrl = parsed.pathname + parsed.search;
    } catch {
      // Already relative
    }
    const payload = JSON.stringify({ title, body, url: pushUrl });

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          // 410 Gone or 404 Not Found = subscription expired, remove it
          if (statusCode === 410 || statusCode === 404) {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, sub.id))
              .catch(() => {});
          } else {
            console.error(`[Push] Failed to send to ${sub.endpoint}:`, err);
          }
        }
      }),
    );
  } catch (err) {
    console.error("[Push] sendPushToUser error:", err);
  }
}

// ---------------------------------------------------------------------------
// sendPushToAdmins -- send push notification to all ADMIN users
// ---------------------------------------------------------------------------
export async function sendPushToAdmins(
  title: string,
  body: string,
  url?: string,
) {
  if (pushDisabled()) return;
  try {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));

    if (admins.length === 0) return;

    await Promise.allSettled(
      admins.map((admin) => sendPushToUser(admin.id, title, body, url)),
    );
  } catch (err) {
    console.error("[Push] sendPushToAdmins error:", err);
  }
}

// ---------------------------------------------------------------------------
// saveSubscription -- save a push subscription for a user
// ---------------------------------------------------------------------------
export async function saveSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
) {
  // Upsert: if (userId, endpoint) already exists, update keys
  const [existing] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({ p256dh, auth })
      .where(eq(pushSubscriptions.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth })
    .returning({ id: pushSubscriptions.id });

  return created.id;
}

// ---------------------------------------------------------------------------
// removeSubscription -- remove subscriptions for a user by endpoint
// ---------------------------------------------------------------------------
export async function removeSubscription(userId: string, endpoint?: string) {
  if (endpoint) {
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      );
  } else {
    // Remove all subscriptions for the user
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }
}
