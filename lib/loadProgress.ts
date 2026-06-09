/**
 * 첫 화면 로딩 진행률(TopProgressBar) 에서 쓰는 예상 시간 보관.
 *
 * - localStorage 에 마지막 로딩 완료 시간(ms) 을 저장한다.
 * - 다음 진입 시 이 값을 "예상 소요 시간" 으로 활용해 진행률을 부드럽게 채워간다.
 * - 너무 짧거나 너무 긴 값은 사용자가 답답하지 않도록 [MIN, MAX] 범위로 보정한다.
 *
 * SSR/시크릿 모드 대응: 모든 접근은 try/catch.
 */

const STORAGE_KEY = "cs-g2b-last-load-ms";

/** 저장값이 없거나 읽기 실패 시 사용할 기본 예상 시간. */
export const DEFAULT_ESTIMATED_MS = 45_000;

/** 너무 짧은 추정값은 의미가 없어 최소 20초로 본다. */
export const MIN_ESTIMATED_MS = 20_000;

/** 너무 긴 추정값은 사용자가 무한 대기로 느낄 수 있어 120초로 자른다. */
export const MAX_ESTIMATED_MS = 120_000;

function clamp(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_ESTIMATED_MS;
  return Math.max(MIN_ESTIMATED_MS, Math.min(MAX_ESTIMATED_MS, Math.round(ms)));
}

export function getEstimatedLoadMs(): number {
  if (typeof window === "undefined") return DEFAULT_ESTIMATED_MS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ESTIMATED_MS;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_ESTIMATED_MS;
    return clamp(n);
  } catch {
    return DEFAULT_ESTIMATED_MS;
  }
}

/**
 * 로딩 완료 시점에 호출. 가중평균 형태로 저장해 한 번 튀는 느려진 로딩에
 * 영구히 끌려가지 않도록 한다.
 *
 * - 저장값이 없으면 그대로 elapsed 저장.
 * - 있으면 (이전 × 0.6 + 이번 × 0.4) 의 가중평균으로 부드럽게 갱신.
 * - 최종값은 항상 clamp.
 */
export function recordLoadCompleteMs(elapsedMs: number) {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
  try {
    const prevRaw = window.localStorage.getItem(STORAGE_KEY);
    const prev = prevRaw ? Number(prevRaw) : null;
    const next =
      prev != null && Number.isFinite(prev) && prev > 0
        ? Math.round(prev * 0.6 + elapsedMs * 0.4)
        : Math.round(elapsedMs);
    window.localStorage.setItem(STORAGE_KEY, String(clamp(next)));
  } catch {
    // ignore
  }
}
