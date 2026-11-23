import { getExpenseShareSettings } from "@/services/team-expense.service";
import { ExpenseTeamShareEditor } from "./expense-team-share-editor";

export async function ExpenseTeamShare({ expense }: {
  expense: { id: string; submittedById: string; companyId: string };
}) {
  const { teams, share } = await getExpenseShareSettings(expense);
  if (teams.length === 0 && !share) return null;

  const initialChoice = share === undefined ? "auto"
    : share.departmentId === null ? "private"
      : teams.some((team) => team.id === share.departmentId) ? share.departmentId
        : "unavailable";
  return <ExpenseTeamShareEditor expenseId={expense.id} teams={teams} initialChoice={initialChoice} />;
}
