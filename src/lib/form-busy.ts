/**
 * "작성 중인 폼이 있다"를 알리는 전역 레지스트리.
 * DOM·React에 기대지 않는다 — node:test로 바로 검증한다(form-busy.test.ts).
 *
 * 왜 필요한가: 새 배포의 서비스워커가 페이지를 넘겨받으면(controllerchange)
 * SwUpdatePrompt가 곧바로 새로고침한다. 입금요청을 반쯤 쓰던 사람은 입력을
 * 통째로 잃는다(iOS PWA는 beforeunload 경고조차 안 뜬다). 폼이 작성 중이라고
 * 알려두면 새로고침을 작성이 끝날 때까지 미룬다.
 *
 * 갇힘 방지 — 옛 청크에 영영 머물면 안 된다:
 * 1. 폼이 언마운트되면(다른 화면으로 이동) useFormBusy가 지운다.
 * 2. 마지막 입력 뒤 FORM_BUSY_MAX_AGE_MS(30분)가 지나면 만료로 본다.
 *    (trackFormActivity가 입력마다 시계를 다시 시작하므로 "30분 무입력"이 기준이다.
 *    계속 쓰고 있는 사람은 만료되지 않고, 방치된 탭만 풀린다.)
 *    기기 시계가 크게 뒤로 가도 같은 폭이면 만료로 본다.
 */

export const FORM_BUSY_MAX_AGE_MS = 30 * 60 * 1000;

type Listener = () => void;

/** 폼 id → busy를 마지막으로 켠·이어쓴 시각(ms). */
const busySince = new Map<string, number>();
const listeners = new Set<Listener>();

function isExpired(at: number, now: number): boolean {
  return Math.abs(now - at) >= FORM_BUSY_MAX_AGE_MS;
}

function pruneExpired(now: number): void {
  for (const [id, at] of busySince) {
    if (isExpired(at, now)) busySince.delete(id);
  }
}

function emit(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (e) {
      console.error("[form-busy] listener failed:", e);
    }
  }
}

/** 폼 하나의 작성 중 여부를 기록한다. 전체 busy 여부가 바뀔 때만 구독자를 부른다. */
export function setFormBusy(id: string, busy: boolean, now: number = Date.now()): void {
  const wasBusy = isAnyFormBusy(now);
  if (busy) busySince.set(id, now);
  else busySince.delete(id);
  if (wasBusy !== isAnyFormBusy(now)) emit();
}

/** 만료되지 않은 작성 중 폼이 하나라도 있는가. */
export function isAnyFormBusy(now: number = Date.now()): boolean {
  pruneExpired(now);
  return busySince.size > 0;
}

/** 모든 busy가 만료될 때까지 남은 ms. 작성 중 폼이 없으면 null. */
export function msUntilFormBusyExpires(now: number = Date.now()): number | null {
  pruneExpired(now);
  if (busySince.size === 0) return null;
  let left = 0;
  for (const at of busySince.values()) {
    left = Math.max(left, at + FORM_BUSY_MAX_AGE_MS - now);
  }
  return left;
}

/** 전체 busy 여부가 바뀔 때 불린다. 반환값으로 구독을 해제한다. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 사용자의 입력을 듣는 대상(브라우저에선 window). 테스트에선 가짜를 넣는다. */
export interface ActivityTarget {
  addEventListener(type: string, handler: () => void, capture: boolean): void;
  removeEventListener(type: string, handler: () => void, capture: boolean): void;
}

/** "아직 쓰고 있다"는 신호. 캡처 단계로 듣는다(폼 안에서 멈추는 이벤트도 잡힌다). */
export const FORM_ACTIVITY_EVENTS = ["input", "change", "keydown", "pointerdown"];

/**
 * busy인 동안 입력이 있을 때마다 만료 시계를 다시 시작한다.
 *
 * 없으면 30분 상한이 "처음 입력한 시각"부터 세어져, 30분 넘게 붙잡고 쓰는 사람도
 * 상한에서 강제 새로고침된다 — 이 기능이 막으려던 바로 그 유실이다. 이걸 붙이면
 * 상한이 "30분 무입력"이 되어 방치된 탭만 만료된다(갇힘 방지는 그대로).
 */
export function trackFormActivity(
  id: string,
  target: ActivityTarget,
  now: () => number = Date.now,
): () => void {
  const touch = () => setFormBusy(id, true, now());
  for (const type of FORM_ACTIVITY_EVENTS) target.addEventListener(type, touch, true);
  return () => {
    for (const type of FORM_ACTIVITY_EVENTS) target.removeEventListener(type, touch, true);
  };
}

export interface ReloadGateOptions {
  /** 실제 새로고침 (브라우저에선 reloadTopWindow). */
  reload: () => void;
  /** 작성 중이라 미뤘을 때 한 번 띄우는 안내. */
  notifyPending: () => void;
  /** 테스트에서 시계를 주입한다. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout> | undefined) => void;
}

/** busy가 잠깐 false로 튄 것인지 확인하는 유예. */
export const IDLE_GRACE_MS = 5_000;
/** reload() 뒤 이 시간 안에 페이지가 안 떠나면 취소된 것으로 보고 다시 시도할 수 있게 푼다. */
export const RELOAD_CANCELLED_MS = 5_000;

export interface ReloadGate {
  /**
   * 새 SW가 페이지를 넘겨받았을 때 부른다.
   * 작성 중인 폼이 없거나 force(사용자가 직접 "업데이트")면 곧바로 새로고침,
   * 아니면 안내를 한 번 띄우고 busy가 풀리거나 만료될 때 새로고침한다.
   */
  request: (force?: boolean) => void;
  /** 대기 중인 구독·타이머를 정리한다(컴포넌트 언마운트). */
  dispose: () => void;
}

/** controllerchange → 새로고침 판단. DOM 없이 테스트할 수 있게 여기 둔다. */
export function createReloadGate(options: ReloadGateOptions): ReloadGate {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h));

  let refreshing = false;
  let pending = false;
  let unsubscribe: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stopWaiting = () => {
    unsubscribe?.();
    unsubscribe = null;
    clearTimer(timer);
    timer = undefined;
  };

  const reloadNow = () => {
    if (refreshing) return;
    refreshing = true;
    // 구독은 **풀지 않는다**. 폼이 아직 dirty면 beforeunload 확인창이 뜨고,
    // 사용자가 "머무르기"를 고르면 새로고침이 취소된다. 여기서 구독까지 끊으면
    // 토스트가 약속한 새로고침이 영영 오지 않는다(옛 청크에 갇힘).
    // 잠시 뒤 잠금을 풀어 다음 busy 해제 때 한 번 더 시도한다(루프는 생기지 않는다).
    clearTimer(timer);
    timer = setTimer(() => {
      timer = undefined;
      refreshing = false;
    }, RELOAD_CANCELLED_MS);
    options.reload();
  };

  const reloadWhenIdle = () => {
    if (refreshing) return;
    const t = now();
    if (!isAnyFormBusy(t)) {
      // 곧바로 새로고침하지 않는다:
      // 1) busy는 잠깐 false로 튈 수 있다 — 흐린 영수증을 지우고 다시 찍는 사이처럼.
      // 2) 이 함수는 setFormBusy → emit으로 **React 커밋 도중**(언마운트 cleanup)
      //    동기 호출된다. 유예를 두어 커밋 밖에서 새로고침한다.
      clearTimer(timer);
      timer = setTimer(() => {
        timer = undefined;
        if (isAnyFormBusy(now())) reloadWhenIdle();
        else reloadNow();
      }, IDLE_GRACE_MS);
      return;
    }
    // busy가 풀리는 건 구독으로, 만료(30분 무입력)는 타이머로 잡는다.
    clearTimer(timer);
    const left = msUntilFormBusyExpires(t);
    if (left !== null) timer = setTimer(reloadWhenIdle, left + 1_000);
  };

  return {
    request(force = false) {
      if (refreshing) return;
      if (force || !isAnyFormBusy(now())) {
        reloadNow();
        return;
      }
      if (pending) return;
      pending = true;
      options.notifyPending();
      unsubscribe = subscribe(reloadWhenIdle);
      reloadWhenIdle();
    },
    dispose() {
      stopWaiting();
    },
  };
}
