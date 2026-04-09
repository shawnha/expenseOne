import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/cached";
import { listUserConnections } from "@/services/codef.service";
import CodefConnectionsClient from "./codef-connections-client";

export const dynamic = "force-dynamic";

export default async function CodefSettingsPage() {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/login");

  const connections = await listUserConnections(authUser.id);

  const serialized = connections.map((c) => ({
    id: c.id,
    cardCompany: c.cardCompany,
    cardNoMasked: c.cardNoMasked,
    lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
    lastSyncStatus: c.lastSyncStatus,
    lastSyncError: c.lastSyncError,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6 max-w-2xl">
      <div className="animate-fade-up">
        <h1 className="text-title3 text-[var(--apple-label)]">
          법카 자동 연동 (Codef)
        </h1>
        <p className="text-footnote text-[var(--apple-secondary-label)] mt-1">
          카드사 계정을 연결하면 법카 사용내역이 자동으로 감지되어
          10분 이내 알림이 전송됩니다. 알림을 탭하면 금액·가맹점이 미리
          채워진 등록 화면이 열립니다.
        </p>
      </div>
      <CodefConnectionsClient connections={serialized} />
    </div>
  );
}
