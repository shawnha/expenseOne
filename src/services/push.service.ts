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

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
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
