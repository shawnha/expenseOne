"use client";

import { useEffect } from "react";
import { setFormBusy } from "@/lib/form-busy";

/**
 * 폼이 작성 중(입력함·제출 중)임을 전역에 알린다. SwUpdatePrompt가 이 값을 보고
 * 새 배포 직후의 강제 새로고침을 작성이 끝날 때까지 미룬다.
 *
 * - effect에서만 기록한다(SSR·하이드레이션에 영향 없음).
 * - 언마운트(다른 화면으로 이동) 시 반드시 지운다.
 * - busy가 켜진 채 30분이 지나면 lib/form-busy가 만료로 본다.
 *
 * @param id 폼마다 고유한 이름 (예: "deposit-request")
 * @param busy 잃으면 안 되는 입력이 있거나 제출 중이면 true
 */
export function useFormBusy(id: string, busy: boolean) {
  useEffect(() => {
    setFormBusy(id, busy);
  }, [id, busy]);

  useEffect(() => () => setFormBusy(id, false), [id]);
}
