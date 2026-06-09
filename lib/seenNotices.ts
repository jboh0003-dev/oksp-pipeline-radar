/**
 * 신규(NEW) 공고 표시 — localStorage 기반 "이전에 본 공고" 추적.
 *
 * 동작:
 *  - 사용자가 처음 접하는 announcementKey 는 firstSeenAt = now 로 기록.
 *  - "신규" 표시는 firstSeenAt 이 NEW_TTL_MS (24h) 이내인 동안 유지.
 *  - 그 이상 지난 항목은 점차 stale 로 분류되고 화면에서는 NEW 가 자동으로 사라진다.
 *  - 너무 오래되어 더는 의미 없는 record (TTL의 7배 이상 경과 등) 는 cleanup 으로 정리.
 *
 * localStorage 키:
 *  - cs-g2b-seen-notices : JSON { [announcementKey: string]: epochMs }
 *
 * SSR / 시크릿 모드 대응:
 *  - window/localStorage 접근은 모두 try/catch 로 감싸 실패 시 빈 결과를 돌려준다.
 */

const STORAGE_KEY = "cs-g2b-seen-notices";

/** "신규" 로 표시할 기간. 마지막 수집 기준으로 새로 들어온 공고는 24h 동안 유지. */
export const NEW_TTL_MS = 24 * 60 * 60 * 1000;

/** 추적 자체를 그만둘 만큼 오래된 record 는 cleanup. (TTL × 7) */
const CLEANUP_TTL_MS = NEW_TTL_MS * 7;

export type SeenMap = Record<string, number>;

function safeReadRaw(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: SeenMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "number" && Number.isFinite(v)) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function safeWrite(map: SeenMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 쿼터 초과/시크릿 모드 등 — 조용히 무시
  }
}

/** 현재까지 추적된 SeenMap 반환 (오래된 record 는 cleanup 후 반환). */
export function loadSeenMap(now: number = Date.now()): SeenMap {
  const map = safeReadRaw();
  const cutoff = now - CLEANUP_TTL_MS;
  let dirty = false;
  for (const [k, ts] of Object.entries(map)) {
    if (ts < cutoff) {
      delete map[k];
      dirty = true;
    }
  }
  if (dirty) safeWrite(map);
  return map;
}

/**
 * 새 데이터에 들어온 announcementKey 들 중 처음 보는 것은 firstSeenAt = now 로 기록한다.
 * 이미 본 적 있는 것은 firstSeenAt 을 그대로 둔다 (NEW 표시가 자연스럽게 끝나도록).
 *
 * 반환값: 이번 호출에서 "처음 본" 키 목록 — 토스트 등에 사용.
 */
export function recordSeenKeys(
  keys: string[],
  now: number = Date.now(),
): { newKeys: string[]; map: SeenMap } {
  const map = loadSeenMap(now);
  const newKeys: string[] = [];
  for (const key of keys) {
    if (!key) continue;
    if (!(key in map)) {
      map[key] = now;
      newKeys.push(key);
    }
  }
  if (newKeys.length > 0) safeWrite(map);
  return { newKeys, map };
}

/** SeenMap 안에 있고, firstSeenAt 이 NEW_TTL_MS 이내인 경우 NEW 로 본다. */
export function isKeyNew(
  key: string,
  map: SeenMap,
  now: number = Date.now(),
): boolean {
  const ts = map[key];
  if (typeof ts !== "number") return false;
  return now - ts <= NEW_TTL_MS;
}

/**
 * 사용자가 명시적으로 "신규 확인 완료" 를 눌렀을 때 — 모든 NEW 표시를 즉시 끈다.
 * 단, 다음 수집에서 또 새 공고가 들어오면 그 항목은 다시 NEW 가 된다.
 */
export function clearAllNew(now: number = Date.now()) {
  const map = safeReadRaw();
  // 모든 firstSeenAt 을 NEW_TTL_MS 보다 더 옛날로 밀어 넣는다.
  const dimAt = now - NEW_TTL_MS - 1;
  for (const k of Object.keys(map)) {
    map[k] = dimAt;
  }
  safeWrite(map);
}
