// ---------------------------------------------------------------------------
// 사입 세금계산서 미발행 알림 — 단계 판정과 문장 (DB 없음, 단위 테스트 대상)
//
// 발행 주기는 월말 일괄, 기한은 익월 10일이다.
//   말일        예고
//   1·5·8일     리마인더 — 남은 날짜와 함께
//   10일        마감일 🚨
//   11일 이후   지연 — 발행할 때까지 매일
//
// 2026-10-01 오너 피드백: "그냥 사입이라 나오는 건지, 현금으로 하기로 했는데 아직 발행이 안 돼서
// 나오는 건지 모르겠다." 예전 문장은 "미발행 3건 (4,992,675원)" 뿐이라 무엇이 걸렸는지 알 수 없었다.
// 이제 줄마다 거래일·등록자·제목·약국·금액을 적고, 무엇을 세는지(「발행 완료」 표시가 없는 약국 줄,
// 결제 방식은 안 봄)와 멈추는 법을 함께 적는다.
// ---------------------------------------------------------------------------

export type ReminderStage =
  | { kind: "preview"; ym: string }
  | { kind: "remind"; ym: string; daysLeft: number }
  | { kind: "due"; ym: string }
  | { kind: "overdue"; ym: string; daysLate: number };

/** yyyy-mm 에서 개월 수를 더한다(음수 가능). */
function shiftMonth(y: number, m: number, delta: number): string {
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** 오늘(KST 날짜 조각)이 어떤 단계인지. 대상 월(ym)도 함께 돌려준다. 알릴 날이 아니면 null. */
export function stageForToday(t: { y: number; m: number; d: number; isLastDay: boolean }): ReminderStage | null {
  const thisMonth = `${t.y}-${String(t.m).padStart(2, "0")}`;
  const prevMonth = shiftMonth(t.y, t.m, -1);

  // 말일: 이번 달 매입분 예고
  if (t.isLastDay) return { kind: "preview", ym: thisMonth };

  // 익월 1~10일: 지난달 매입분이 대상
  if (t.d === 1 || t.d === 5 || t.d === 8) {
    return { kind: "remind", ym: prevMonth, daysLeft: 10 - t.d };
  }
  if (t.d === 10) return { kind: "due", ym: prevMonth };
  if (t.d > 10) return { kind: "overdue", ym: prevMonth, daysLate: t.d - 10 };

  return null;
}

/** 휴대폰 푸시처럼 짧게 — 제목 한 줄 + 본문 한 줄. */
export function buildReminderPush(stage: ReminderStage, count: number, total: number, dueDate: string) {
  const amount = `${total.toLocaleString("ko-KR")}원`;
  const ymLabel = stage.ym.replace("-", ".");
  switch (stage.kind) {
    case "preview":
      return {
        emoji: "📋",
        title: "사입 세금계산서 발행 예정",
        body: `${ymLabel} 사입 ${count}건 (${amount}). 발행 기한은 ${dueDate.replaceAll("-", ".")}입니다.`,
      };
    case "remind":
      return {
        emoji: "⏰",
        title: "사입 세금계산서 미발행",
        body: `${ymLabel} 미발행 ${count}건 (${amount}). 발행 기한까지 ${stage.daysLeft}일 남았습니다.`,
      };
    case "due":
      return {
        emoji: "🚨",
        title: "오늘이 사입 계산서 발행 기한",
        body: `${ymLabel} 미발행 ${count}건 (${amount}). 오늘까지 발행하셔야 합니다.`,
      };
    case "overdue":
      return {
        emoji: "🔴",
        title: "사입 계산서 발행 기한 초과",
        body: `${ymLabel} 미발행 ${count}건 (${amount}). 기한을 ${stage.daysLate}일 넘겼습니다.`,
      };
  }
}

/** 알림에 적을 미발행 약국 줄 하나(= 계산서 한 장). */
export interface ReminderLine {
  expenseId: string;
  /** 비용의 거래일 YYYY-MM-DD — 달을 묶는 기준과 같다. */
  transactionDate: string;
  title: string;
  submitterName: string | null;
  pharmacyName: string;
  /** 공급가액 + 부가세 */
  total: number;
}

/** Slack 에 다 적는 줄 수. 넘치면 "…외 N곳" — 전부는 발행 관리 화면에 있다. */
export const REMINDER_MAX_LINES = 15;

/** Slack mrkdwn 의 제어 문자. 제목에 < > 가 있으면 링크가 깨진다. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function headline(stage: ReminderStage, dueLabel: string): string {
  const ym = stage.ym.replace("-", ".");
  switch (stage.kind) {
    case "preview":
      return `📋 *사입 세금계산서 발행 예정* — ${ym}분, 기한 ${dueLabel}`;
    case "remind":
      return `⏰ *사입 세금계산서 미발행* — ${ym}분까지, 기한 ${dueLabel} (${stage.daysLeft}일 남음)`;
    case "due":
      return `🚨 *오늘이 사입 계산서 발행 기한* — ${ym}분까지, 기한 ${dueLabel}`;
    case "overdue":
      return `🔴 *사입 계산서 발행 기한 초과* — ${ym}분까지, 기한 ${dueLabel}을 ${stage.daysLate}일 넘김`;
  }
}

/**
 * Slack 본문. 오래된 줄부터(가장 급한 것) 최대 REMINDER_MAX_LINES 줄.
 * 제목은 그 비용 상세로 가는 링크 — 거기서 사입 표시를 빼거나 내용을 확인한다.
 */
export function buildReminderSlackText(
  stage: ReminderStage,
  lines: readonly ReminderLine[],
  opts: { appUrl: string; dueDate: string },
): string {
  const dueLabel = opts.dueDate.replaceAll("-", ".");
  const total = lines.reduce((acc, l) => acc + l.total, 0);
  const sorted = [...lines].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
  const shown = sorted.slice(0, REMINDER_MAX_LINES);

  const out = [headline(stage, dueLabel), `아직 「발행 완료」를 누르지 않은 약국 ${lines.length}곳 · ${won(total)}`];
  for (const l of shown) {
    const date = l.transactionDate.slice(5).replace("-", ".");
    const who = l.submitterName ? ` ${esc(l.submitterName)}` : "";
    out.push(`• ${date}${who} — <${opts.appUrl}/expenses/${l.expenseId}|${esc(l.title)}> → ${esc(l.pharmacyName)} ${won(l.total)}`);
  }
  if (sorted.length > shown.length) out.push(`…외 ${sorted.length - shown.length}곳`);
  out.push(
    "_사입으로 등록된 비용의 납품 약국 줄 중 「발행 완료」 표시가 없는 것을 셉니다. 결제 방식(현금·외상)은 보지 않습니다 — " +
      "발행했으면 「발행 완료」를 누르면 멈추고, 세금계산서가 필요 없는 건이면 비용에서 「사입」 표시를 빼 주세요._",
  );
  out.push(`<${opts.appUrl}/admin/purchase-invoice|발행 관리 열기>`);
  return out.join("\n");
}
