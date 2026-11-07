import type { OcrFields } from "./types";

export interface DocumentCompany {
  id: string;
  name: string;
  businessNumber: string | null;
  aliases?: string[];
}

export type DocumentCompanyMatch =
  | { kind: "none" }
  | { kind: "conflict"; message: string }
  | { kind: "match"; company: DocumentCompany; by: "businessNumber" | "name"; automatic: boolean };

export const companyNameKey = (name: string) => name
  .normalize("NFKC").toLowerCase().replace(/주식회사|\(주\)|㈜/g, "").replace(/[\s.,·()]/g, "");

export function matchDocumentCompanies(fields: OcrFields[], companies: DocumentCompany[]): DocumentCompanyMatch {
  const matches: Array<Extract<DocumentCompanyMatch, { kind: "match" }>> = [];
  for (const field of fields) {
    // 업체 자신을 설명하는 서류에서는 공급받는자를 추론하지 않는다.
    if (["통장사본", "사업자등록증", "신분증"].includes(field.docType)) continue;
    const name = companyNameKey(field.recipientCompanyName ?? "");
    const number = (field.recipientBusinessNumber ?? "").replace(/\D/g, "");
    if (!name && !number) continue;
    const byName = name ? companies.filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => companyNameKey(n) === name)) : [];
    const byNumber = number.length === 10 ? companies.filter((c) => c.businessNumber?.replace(/\D/g, "") === number) : [];
    if (number && (number.length !== 10 || byNumber.length !== 1)) {
      return { kind: "conflict", message: "서류의 수신 회사 사업자등록번호를 등록된 법인과 대조하지 못했습니다. 회사 선택을 확인해주세요." };
    }
    const candidates = number ? byNumber : byName;
    if (candidates.length !== 1) {
      return { kind: "conflict", message: "서류의 수신 회사명을 하나의 법인으로 확인하지 못했습니다. 회사 선택을 확인해주세요." };
    }
    const company = candidates[0];
    if (number && byName.length > 0 && !byName.some((c) => c.id === company.id)) {
      return { kind: "conflict", message: "서류의 수신 회사명과 사업자등록번호가 서로 다른 법인을 가리킵니다. 원본 서류를 확인해주세요." };
    }
    matches.push({ kind: "match", company, by: number ? "businessNumber" : "name", automatic: field.confidence === "high" });
  }
  if (new Set(matches.map((m) => m.company.id)).size > 1) {
    return { kind: "conflict", message: "첨부 서류마다 수신 법인이 다릅니다. 이번 비용의 회사와 증빙을 확인해주세요." };
  }
  if (!matches.length) return { kind: "none" };
  // 모든 수신자 증빙이 같은 법인을 가리킬 때만 합친다. 낮은 신뢰도의 결과만 있으면 적용을 제안한다.
  const best = matches.find((m) => m.automatic && m.by === "businessNumber") ?? matches.find((m) => m.automatic) ?? matches[0];
  return best;
}
