import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { getPurchaseInvoiceSummary } from "@/services/expense.service";

// ---------------------------------------------------------------------------
// GET /api/export/purchase-invoice — 사입 세금계산서 CSV
//
// **한 줄 = 계산서 한 장.** 사입 한 건에 약국이 여럿이면 여러 줄로 나온다.
// 일반 비용 CSV(/api/export/csv)는 비용 한 건이 한 줄이라 약국 여럿을 담을 수
// 없어서 따로 뺐다. 세무에 넘기는 건 이쪽이다.
// ---------------------------------------------------------------------------

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const sp = request.nextUrl.searchParams;
    const company = sp.get("company") ?? undefined;
    const statusParam = sp.get("status");
    const status =
      statusParam === "unissued" || statusParam === "issued" ? statusParam : "all";

    const months = await getPurchaseInvoiceSummary({
      company,
      status,
      startDate: sp.get("startDate") ?? undefined,
      endDate: sp.get("endDate") ?? undefined,
    });

    const headers = [
      "매입월", "발행기한", "거래일", "비용제목",
      "약국명", "사업자등록번호", "품목·수량",
      "공급가액", "부가세", "합계",
      "발행여부", "발행일", "회사", "제출자", "매입원가",
    ];

    const lines: string[] = [headers.join(",")];
    for (const m of months) {
      for (const exp of m.expenses) {
        for (const l of exp.lines) {
          lines.push(
            [
              m.yearMonth,
              m.dueDate,
              exp.transactionDate,
              exp.title,
              l.pharmacyName,
              l.pharmacyBizNo ?? "",
              l.purchaseItems ?? "",
              l.supplyAmount,
              l.vat,
              l.total,
              l.invoiceIssuedAt ? "발행완료" : "미발행",
              l.invoiceIssuedAt
                ? new Date(l.invoiceIssuedAt).toISOString().slice(0, 10)
                : "",
              exp.companyName ?? "",
              exp.submitterName ?? "",
              exp.cost,
            ]
              .map(csvEscape)
              .join(","),
          );
        }
      }
    }

    // Excel이 UTF-8로 인식하도록 BOM을 붙인다 (기존 CSV export와 동일).
    const body = "﻿" + lines.join("\n");
    const filename = `purchase-invoice-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
