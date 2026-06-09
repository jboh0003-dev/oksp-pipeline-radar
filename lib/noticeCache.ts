import type { Notice } from "@/data/sampleNotices";

/**
 * 첫 진입 가속 — Supabase 라운드트립이 끝나기 전에 캐시를 즉시 표시하기 위한 localStorage 캐시.
 *
 * 정책:
 *  - 키: `csg2b:notices` (JSON Notice[])
 *       `csg2b:lastFetchAt` (epoch ms)
 *  - TTL: 자동 진입 시 15분 — 이보다 오래된 캐시는 그대로 화면에 잠깐 보여주되, 곧장 재수집을 트리거.
 *  - 수동 "지금 수집" 은 캐시를 무시하고 강제 최신화.
 *
 * SSR/시크릿 모드 안전:
 *  - 모든 접근은 try/catch 로 감싸 실패 시 null 반환.
 *  - JSON.parse 실패 / 형태가 이상한 데이터는 무시.
 */

const CACHE_KEY = "csg2b:notices";
const TIMESTAMP_KEY = "csg2b:lastFetchAt";
const SOURCE_KEY = "csg2b:lastSource";

/** 자동 진입 캐시가 신선하다고 보는 기간(ms). 15분. */
export const NOTICES_CACHE_TTL_MS = 15 * 60 * 1000;

export type NoticeCacheEntry = {
  notices: Notice[];
  fetchedAt: number;
  source: "supabase" | "sample";
  /** TTL 안에 있는 신선한 캐시인지. */
  isFresh: boolean;
};

export function loadNoticesCache(now: number = Date.now()): NoticeCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const tsRaw = window.localStorage.getItem(TIMESTAMP_KEY);
    if (!raw || !tsRaw) return null;
    const fetchedAt = Number(tsRaw);
    if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const source =
      (window.localStorage.getItem(SOURCE_KEY) as "supabase" | "sample" | null) ??
      "supabase";
    return {
      notices: parsed as Notice[],
      fetchedAt,
      source,
      isFresh: now - fetchedAt <= NOTICES_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

export function saveNoticesCache(
  notices: Notice[],
  source: "supabase" | "sample",
  now: number = Date.now(),
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(notices));
    window.localStorage.setItem(TIMESTAMP_KEY, String(now));
    window.localStorage.setItem(SOURCE_KEY, source);
  } catch {
    // 쿼터 초과 등은 조용히 무시
  }
}

export function clearNoticesCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
    window.localStorage.removeItem(TIMESTAMP_KEY);
    window.localStorage.removeItem(SOURCE_KEY);
  } catch {
    // ignore
  }
}
