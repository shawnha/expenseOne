"use client";

import { useEffect } from "react";
import { setFormBusy, trackFormActivity } from "@/lib/form-busy";

/**
 * 폼이 작성 중(입력함·제출 중)임을 전역에 알린다. SwUpdatePrompt가 이 값을 보고
 * 새 배포 직후의 강제 새로고침을 작성이 끝날 때까지 미룬다.
 *
 * - effect에서만 기록한다(SSR·하이드레이션에 영향 없음).
 * - 언마운트(다른 화면으로 이동) 시 반드시 지운다.
 * - busy인 동안 입력을 들어(trackFormActivity) 만료 시계를 다시 시작한다.
 *   deps가 [id, busy]라 setFormBusy는 boolean이 바뀔 때만 불린다 — 이 구독이 없으면
 *   30분 상한이 "처음 입력한 시각"부터 세어져, 계속 쓰고 있는 사람도 상한에서
 *   새로고침된다. 이제 상한은 "30분 무입력"이다.
 *
 * @param id 폼마다 고유한 이름 (예: "deposit-request")
 * @param busy 잃으면 안 되는 입력이 있거나 제출 중이면 true
 */
export function useFormBusy(id: string, busy: boolean) {
  useEffect(() => {
    setFormBusy(id, busy);
    if (!busy || typeof window === "undefined") return;
    return trackFormActivity(id, window);
  }, [id, busy]);

  useEffect(() => () => setFormBusy(id, false), [id]);
}
