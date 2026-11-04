import { requireAuth, handleError, jsonWithCache } from "@/lib/api-utils";
import { getDocumentCompanies } from "@/services/document-company.service";

export async function GET() {
  try {
    await requireAuth();
    return jsonWithCache({ data: await getDocumentCompanies() }, 0, 60);
  } catch (error) {
    return handleError(error);
  }
}
