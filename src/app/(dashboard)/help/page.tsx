import { redirect } from "next/navigation";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { getHelpSections } from "@/lib/help/content";
import { HelpView } from "@/components/help/help-view";

export const metadata = { title: "사용법 | ExpenseOne" };

// 앱 안 사용법. 오른쪽 위 물음표 아이콘에서 들어온다. 관리자 내용은 관리자에게만,
// 비용계획 내용은 계획 스위치가 켜진 사람에게만(HelpView 안에서 PlansNavGate) 보인다.
export default async function HelpPage() {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  const role = user.role === "ADMIN" ? "ADMIN" : "MEMBER";
  return <HelpView sections={getHelpSections(role)} />;
}
