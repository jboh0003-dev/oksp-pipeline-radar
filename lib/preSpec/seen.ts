/**
 * 사전규격공고 신규(NEW) 추적 — 입찰공고용 seenNotices 와 별개 키 공간을 쓴다.
 *
 * 정책 (입찰과 동일):
 *  - 최초 수집은 모두 stale 시드 → 신규 0건 처리, 플래그 저장.
 *  - 두 번째 수집부터 새 키만 firstSeenAt = now → 24h 동안 NEW 로 표시.
 *  - "신규 표시 초기화" 로 사용자 수동 복구 가능.
 *
 * localStorage 키:
 *  - csg2b:preSpec:seenKeys      : JSON { [announcementKey]: epochMs }
 *  - csg2b:preSpec:initialized   : "true" 면 최초 시드 완료
 */

const STORAGE_KEY = "csg2b:preSpec:seenKeys";
const INIT_FLAG_KEY = "csg2b:preSpec:initialized";

export const PRE_SPEC_NEW_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_TTL_MS = PRE_SPEC_NEW_TTL_MS * 7;
const STALE_OFFSET_MS = PRE_SPEC_NEW_TTL_MS + 1;

export type PreSpecSeenMap = Record<string, number>;

function safeReadRaw(): PreSpecSeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: PreSpecSeenMap = {};
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

function safeWrite(map: PreSpecSeenMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function readInitFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(INIT_FLAG_KEY) === "true";
  } catch {
    return false;
  }
}

function writeInitFlag(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(INIT_FLAG_KEY, "true");
    else window.localStorage.removeItem(INIT_FLAG_KEY);
  } catch {
    // ignore
  }
}

export function loadPreSpecSeenMap(now: number = Date.now()): PreSpecSeenMap {
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

export function recordPreSpecSeenKeys(
  keys: string[],
  now: number = Date.now(),
): { newKeys: string[]; map: PreSpecSeenMap } {
  const map = loadPreSpecSeenMap(now);
  const initialized = readInitFlag();

  if (!initialized) {
    const stale = now - STALE_OFFSET_MS;
    for (const k of keys) {
      if (!k) continue;
      if (!(k in map)) map[k] = stale;
    }
    safeWrite(map);
    writeInitFlag(true);
    return { newKeys: [], map };
  }

  const newKeys: string[] = [];
  for (const k of keys) {
    if (!k) continue;
    if (!(k in map)) {
      map[k] = now;
      newKeys.push(k);
    }
  }
  if (newKeys.length > 0) safeWrite(map);
  return { newKeys, map };
}

export function isPreSpecKeyNew(
  key: string,
  map: PreSpecSeenMap,
  now: number = Date.now(),
): boolean {
  const ts = map[key];
  if (typeof ts !== "number") return false;
  return now - ts <= PRE_SPEC_NEW_TTL_MS;
}

export function resetPreSpecSeen(currentKeys: string[], now: number = Date.now()) {
  const stale = now - STALE_OFFSET_MS;
  const map: PreSpecSeenMap = {};
  for (const k of currentKeys) {
    if (!k) continue;
    map[k] = stale;
  }
  safeWrite(map);
  writeInitFlag(true);
  return map;
}
