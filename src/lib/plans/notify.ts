import { after } from "next/server";
import { sendPushToUser } from "@/services/push.service";

// ---------------------------------------------------------------------------
// 비용계획 푸시 알림.
//
// 왜 푸시만인가: 앱의 알림 종(expenseone.notifications)은 type 이 고정 enum 이고 ERP 가 그대로
// 복제한다. 값을 하나 추가하면 ERP 사본 CHECK 가 깨져 복제가 멈춘다(2026-06 REFUND 사고).
// 푸시는 그 표를 거치지 않아 ERP 와 무관하다. 알림 종 목록은 ERP 가 CHECK 를 넓힌 뒤 붙인다.
//
// 언제 보내나: 트랜잭션이 **커밋된 뒤** 서비스가 dispatchPlanPush 를 부른다. 실패해도 저장은 이미
// 끝나 있다. 본인이 한 일은 본인에게 보내지 않는다.
//
// 어떻게 보내나(QA D-05): `void sendPushToUser(...)` 로 흘려보내면 응답을 돌려준 순간 Vercel 함수가
// 얼어 푸시가 사라질 수 있다. 라우트 안에서는 Next 의 `after()` 로 "응답 뒤, 함수가 끝나기 전" 에 보내고
// (응답은 기다리지 않는다), 요청 밖(테스트·향후 cron)이라 after() 가 없으면 기존 알림 코드처럼
// `await Promise.allSettled` 로 자리에서 기다린다. 어느 쪽이든 개별 실패는 로그만.
// ---------------------------------------------------------------------------

export type PlanPushKind =
  | "plan_created"
  | "plan_updated"
  | "plan_cancelled"
  | "comment_added"
  | "member_added"
  | "link_added"
  | "link_removed"
  | "project_deleted";

export interface PlanPushEvent {
  kind: PlanPushKind;
  actorId: string;
  actorName: string;
  projectName: string;
  /** 계획 항목 이벤트면 상세로 보낸다. 프로젝트 이벤트(참여자 추가)는 보드로. */
  planId?: string;
  planTitle?: string;
  /** 후보 수신자(프로젝트 참여자 전원 또는 추가된 사람). 본인은 여기서 걸러진다. */
  candidateIds: string[];
}

export interface PlanPushMessage {
  title: string;
  body: string;
  url: string;
}

/** 본인 제외·중복 제거. 순서는 유지한다. */
export function pickRecipients(candidateIds: string[], actorId: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of candidateIds) {
    if (id === actorId || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

const MAX_TITLE = 40;

function clip(text: string): string {
  const t = text.trim();
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1)}…` : t;
}

/** 알림 문구. 순수 함수 — 테스트로 고정한다. */
export function buildPlanPush(ev: PlanPushEvent): PlanPushMessage {
  const plan = ev.planTitle ? clip(ev.planTitle) : "계획";
  const url = ev.planId ? `/plans/${ev.planId}` : "/plans";
  switch (ev.kind) {
    case "plan_created":
      return { title: `[비용계획] ${ev.projectName}`, body: `${ev.actorName} 님이 '${plan}' 계획을 추가했습니다.`, url };
    case "plan_updated":
      return { title: `[비용계획] ${ev.projectName}`, body: `${ev.actorName} 님이 '${plan}' 계획을 수정했습니다.`, url };
    case "plan_cancelled":
      return { title: `[비용계획] ${ev.projectName}`, body: `${ev.actorName} 님이 '${plan}' 계획을 취소했습니다.`, url };
    case "comment_added":
      return { title: `[비용계획] ${plan}`, body: `${ev.actorName} 님이 메모를 남겼습니다.`, url };
    case "member_added":
      return { title: `[비용계획] ${ev.projectName}`, body: `${ev.actorName} 님이 나를 참여자로 추가했습니다.`, url };
    case "link_added":
      return { title: `[비용계획] ${plan}`, body: `${ev.actorName} 님이 입금요청을 연결했습니다.`, url };
    case "link_removed":
      return { title: `[비용계획] ${plan}`, body: `${ev.actorName} 님이 입금요청 연결을 해제했습니다.`, url };
    case "project_deleted":
      return { title: `[비용계획] ${ev.projectName}`, body: `${ev.actorName} 님이 프로젝트를 삭제했습니다.`, url: "/plans" };
  }
}

/** 수신자 전원에게 보내고 개별 실패는 로그만. 푸시 키가 없거나 구독이 없으면 sendPushToUser 가 조용히 건너뛴다. */
async function sendAll(ev: PlanPushEvent, recipients: string[]): Promise<void> {
  const msg = buildPlanPush(ev);
  await Promise.allSettled(
    recipients.map((userId) =>
      sendPushToUser(userId, msg.title, msg.body, msg.url).catch((err: unknown) => {
        console.error("[Plans] push failed:", ev.kind, err instanceof Error ? err.message : err);
      }),
    ),
  );
}

/**
 * 커밋 뒤에 부른다(서비스 함수의 트랜잭션 밖). 라우트 안이면 after() 에 맡기고 곧바로 돌아오고,
 * 요청 밖이면 자리에서 기다린다. 어느 경우에도 던지지 않는다 — 저장은 이미 끝났다.
 */
export async function dispatchPlanPush(ev: PlanPushEvent | null | undefined): Promise<void> {
  if (!ev) return;
  const recipients = pickRecipients(ev.candidateIds, ev.actorId);
  if (recipients.length === 0) return;
  try {
    after(() => sendAll(ev, recipients));
    return;
  } catch {
    // after() 는 요청 범위 밖에서 던진다(E468). 그때는 여기서 기다린다.
  }
  await sendAll(ev, recipients);
}
