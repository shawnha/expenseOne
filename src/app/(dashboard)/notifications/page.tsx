import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/cached";
import { getNotifications } from "@/services/notification.service";
import type { Notification } from "@/types";
import NotificationList from "./notification-list";

export default async function NotificationsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const result = await getNotifications(user.id, 1, 50);

  // Map DB rows to the client-side Notification shape (Date -> string)
  const notifications: Notification[] = result.data.map((row) => ({
    id: row.id,
    recipientId: row.recipientId,
    type: row.type as Notification["type"],
    title: row.title,
    message: row.message,
    relatedExpenseId: row.relatedExpenseId,
    linkUrl: row.linkUrl ?? null,
    isRead: row.isRead,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <NotificationList initialNotifications={notifications} userId={user.id} />
  );
}
