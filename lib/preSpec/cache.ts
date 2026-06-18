import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

/**
 * 사전규격공고 화면 캐시 — 입찰공고와 동일한 정책이지만 별도 키 공간을 쓴다.
 *
 *  - csg2b:preSpec:items         : JSON PreSpecAnnouncement[]
 *  - csg2b:preSpec:lastFetchAt   : epoch ms
 *  - csg2b:preSpec:lastDurationMs: 마지막 수집 소요 ms (loading bar ETA 추정용)
 *
 * TTL 15분 — 자동 진입 시. 수동 "지금 수집" 은 캐시 무시.
 */

// v2: 2026-06 PreSpecAnnouncement 의 URL 필드 구조가 detailUrl/searchUrl/detailUrlVerified 로 변경.
// 구 캐시(v1) 가 그대로 화면에 들어오면 detailUrlMethod 가 undefined 라 UI 가 잘못 분기되므로
// 키를 분리해 자동 폐기시킨다.
const ITEMS_KEY = "csg2b:preSpec:items.v2";
const TIMESTAMP_KEY = "csg2b:preSpec:lastFetchAt.v2";
const DURATION_KEY = "csg2b:preSpec:lastDurationMs.v2";

export const PRE_SPEC_CACHE_TTL_MS = 15 * 60 * 1000;

export type PreSpecCacheEntry = {
  items: PreSpecAnnouncement[];
  fetchedAt: number;
  isFresh: boolean;
};

export function loadPreSpecCache(now: number = Date.now()): PreSpecCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ITEMS_KEY);
    const tsRaw = window.localStorage.getItem(TIMESTAMP_KEY);
    if (!raw || !tsRaw) return null;
    const fetchedAt = Number(tsRaw);
    if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return {
      items: parsed as PreSpecAnnouncement[],
      fetchedAt,
      isFresh: now - fetchedAt <= PRE_SPEC_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

export function savePreSpecCache(items: PreSpecAnnouncement[], now: number = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    window.localStorage.setItem(TIMESTAMP_KEY, String(now));
  } catch {
    // ignore
  }
}

export function recordPreSpecLoadDurationMs(ms: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DURATION_KEY, String(ms));
  } catch {
    // ignore
  }
}

export function getPreSpecLastDurationMs(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DURATION_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
