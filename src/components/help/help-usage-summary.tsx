"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type UsageRow = { viewport: "mobile" | "desktop"; views: number; clicks: number };

export function HelpUsageSummary() {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/help/usage", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setRows(result.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="glass-card px-4" onToggle={(event) => {
      if (event.currentTarget.open && !rows && !loading && !error) void load();
    }}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--apple-label)]">사용법 이용 현황 · 최근 7일</summary>
      <div className="space-y-3 pb-4 text-sm">
        {loading && <p role="status">불러오는 중…</p>}
        {error && <div className="flex flex-wrap items-center gap-2" role="status">
          <p>이용 현황을 불러올 수 없습니다.</p>
          <Button variant="outline" size="lg" type="button" onClick={() => void load()}>다시 시도</Button>
        </div>}
        {rows && (
          <>
            <p className="text-footnote text-[var(--apple-secondary-label)]">하루에 같은 브라우저 탭은 화면 크기별로 한 번 집계합니다.</p>
            <table className="w-full table-fixed text-left text-footnote tabular-nums">
              <thead className="text-[var(--apple-secondary-label)]">
                <tr><th scope="col">화면</th><th scope="col" className="text-right">노출</th><th scope="col" className="text-right">클릭</th><th scope="col" className="text-right">클릭률</th></tr>
              </thead>
              <tbody>
                {(["mobile", "desktop"] as const).map((viewport) => {
                  const { views, clicks } = rows.find((row) => row.viewport === viewport) ?? { views: 0, clicks: 0 };
                  return <tr key={viewport} className="border-t border-[var(--apple-separator)]">
                    <th scope="row" className="py-2 font-medium">{viewport === "mobile" ? "모바일" : "PC"}</th>
                    <td className="text-right">{views.toLocaleString("ko-KR")}</td>
                    <td className="text-right">{clicks.toLocaleString("ko-KR")}</td>
                    <td className="text-right">{views ? `${(clicks / views * 100).toFixed(1)}%` : "—"}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </details>
  );
}
