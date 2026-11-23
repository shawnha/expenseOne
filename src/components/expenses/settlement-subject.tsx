import { getSettlementSubject } from "@/services/brand-settlement.service";
import { currentSettlementMonth, type SettlementSource } from "@/lib/validations/brand-settlement";
import { SettlementSubjectEditor } from "./settlement-subject-editor";

export async function SettlementSubject({ id, source, companyId, suggestedBrand }: {
  id: string;
  source: SettlementSource;
  companyId: string;
  suggestedBrand?: string | null;
}) {
  const existing = await getSettlementSubject(source, id, companyId);
  return (
    <SettlementSubjectEditor
      id={id}
      source={source}
      existing={existing}
      suggestedBrand={suggestedBrand}
      defaultMonth={currentSettlementMonth()}
    />
  );
}
