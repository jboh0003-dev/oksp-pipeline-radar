/**
 * 신규(NEW) 공고 표시 — localStorage 기반 "이전에 본 공고" 추적.
 *
 * 정책 (회의 피드백 — "최초 진입 시 58개 전부 신규로 떠버리는 문제" 반영):
 *  - 최초 실행: 현재 데이터에 들어온 모든 announcementKey 를 "이미 본 것" 으로 취급해
 *    NEW 표시는 하나도 띄우지 않는다. 그 다음에 한해 `csg2b:newStateInitialized` 플래그를
 *    `"true"` 로 저장한다.
 *  - 두 번째 호출부터: 기존 SeenMap 에 없던 키만 firstSeenAt = now 로 기록 → NEW 로 표시.
 *  - "신규" 표시는 firstSeenAt 이 NEW_TTL_MS (24h) 이내인 동안 유지.
 *  - 너무 오래되어 더는 의미 없는 record (TTL의 7배 이상 경과) 는 cleanup.
 *
 * localStorage 키:
 *  - cs-g2b-seen-notices            : JSON { [announcementKey]: epochMs (firstSeenAt) }
 *  - csg2b:newStateInitialized       : "true" 면 최초 시드(seed)가 끝났다는 신호.
 *
 * 마이그레이션:
 *  - 기존 사용자(=플래그가 없는데 SeenMap 은 이미 채워져 있는 경우)는 첫 호출 시
 *    모든 entry 를 "이미 stale" 로 밀어 넣어 화면이 한번에 NEW 로 폭발하는 사고를 방지.
 *  - 그 후 정상 흐름으로 복귀.
 *
 * SSR / 시크릿 모드 대응:
 *  - window/localStorage 접근은 모두 try/catch 로 감싸 실패 시 빈 결과를 돌려준다.
 */

const STORAGE_KEY = "cs-g2b-seen-notices";
const INIT_FLAG_KEY = "csg2b:newStateInitialized";

/** "신규" 로 표시할 기간. 마지막 수집 기준으로 새로 들어온 공고는 24h 동안 유지. */
export const NEW_TTL_MS = 24 * 60 * 60 * 1000;

/** 추적 자체를 그만둘 만큼 오래된 record 는 cleanup. (TTL × 7) */
const CLEANUP_TTL_MS = NEW_TTL_MS * 7;

/** stale 처리(NEW 표시 끄기) 용 timestamp — 충분히 옛날로 밀어 넣는다. */
const STALE_OFFSET_MS = NEW_TTL_MS + 1;

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
    if (value) {
      window.localStorage.setItem(INIT_FLAG_KEY, "true");
    } else {
      window.localStorage.removeItem(INIT_FLAG_KEY);
    }
  } catch {
    // ignore
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
 * 새 데이터에 들어온 announcementKey 들을 SeenMap 에 반영한다.
 *
 *  - 최초 실행(`csg2b:newStateInitialized` 미설정): 이번 키 전부를 "이미 stale" 로 시드.
 *    → 화면에 NEW 가 하나도 뜨지 않는다. 플래그를 true 로 저장한다.
 *  - 이후 실행: 기존 SeenMap 에 없던 키만 firstSeenAt = now 로 기록 → 24h 동안 NEW 표시.
 *
 * 반환값:
 *  - newKeys : 이번 호출에서 "처음 본" 키 목록 (수집 토스트에 사용). 최초 실행에서는 항상 [].
 *  - map     : 갱신된 SeenMap.
 */
export function recordSeenKeys(
  keys: string[],
  now: number = Date.now(),
): { newKeys: string[]; map: SeenMap } {
  const map = loadSeenMap(now);
  const initialized = readInitFlag();

  if (!initialized) {
    // 최초 실행 — 화면이 한번에 NEW 로 폭발하는 사고 방지.
    const stale = now - STALE_OFFSET_MS;
    for (const key of keys) {
      if (!key) continue;
      // 이미 등록된 키는 그대로 두고, 처음 보는 키만 stale 로 시드.
      if (!(key in map)) map[key] = stale;
    }
    safeWrite(map);
    writeInitFlag(true);
    return { newKeys: [], map };
  }

  // 정상 흐름 — 처음 보는 키만 firstSeenAt = now 로 기록 → 24h NEW.
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
 * "신규 표시 초기화" 버튼.
 *  - 잘못된 데이터 / 첫 진입 폭주 등을 사용자가 수동으로 복구할 수 있는 안전판.
 *  - 현재 화면의 키들을 전부 "이미 본 것 + stale" 로 강제 표시 → 모든 NEW 가 즉시 사라진다.
 *  - 다음 수집부터는 정상 흐름(새 키만 NEW) 로 동작한다.
 */
export function resetNewState(
  currentKeys: string[],
  now: number = Date.now(),
): SeenMap {
  const stale = now - STALE_OFFSET_MS;
  const map: SeenMap = {};
  for (const key of currentKeys) {
    if (!key) continue;
    map[key] = stale;
  }
  safeWrite(map);
  writeInitFlag(true);
  return map;
}

/** (구) `clearAllNew` — 외부 호출자 호환을 위해 resetNewState 위임. */
export function clearAllNew(now: number = Date.now()) {
  // 현재 키 목록을 알 수 없을 때의 fallback — 기존 entry 전부를 stale 로 만든다.
  const map = safeReadRaw();
  const stale = now - STALE_OFFSET_MS;
  for (const k of Object.keys(map)) {
    map[k] = stale;
  }
  safeWrite(map);
  writeInitFlag(true);
}
