/**
 * "신규(NEW) 공고" 표시를 snapshot diff 기준으로 통일 관리하는 모듈.
 *
 * 통일된 정의:
 *  - 신규 = "이전 수집 snapshot 에는 없었지만, 이번 수집 snapshot 에 새로 등장한 announcementKey"
 *  - 어제 있던 공고가 오늘도 있으면 신규가 아니다.
 *  - 최초 수집(또는 초기화) 직후에는 기준선만 저장하고 신규 0건으로 처리한다.
 *  - 신규 표시는 24시간 동안 유지되고 자동으로 사라진다.
 *
 * scope:
 *  - "bid"     : 입찰공고 화면.
 *  - "preSpec" : 사전규격공고 화면.
 *  → 두 화면은 storage key 가 분리되어 있어 서로 영향을 주지 않는다.
 *
 * localStorage 키 (scope 별):
 *  - csg2b:{scope}:lastSnapshotKeys : JSON string[] — 직전 수집 시 본 announcementKey 의 set
 *  - csg2b:{scope}:firstSeenMap     : JSON { key: epochMs } — 각 key 를 처음 본 시각 (감사/디버깅용)
 *  - csg2b:{scope}:newMap           : JSON { key: epochMs } — "이번에 새로 등장한 키" 와 그 시점
 *  - csg2b:{scope}:newInitialized   : "true" 면 최초 시드(seed) 완료
 *
 * 모든 함수는 SSR / 시크릿 모드 / quota 초과 등에 대해 try/catch 안전.
 */

type Scope = "bid" | "preSpec";

type ScopeKeys = {
  last: string;
  firstSeen: string;
  newMap: string;
  init: string;
};

const STORAGE_KEYS: Record<Scope, ScopeKeys> = {
  bid: {
    last: "csg2b:bid:lastSnapshotKeys",
    firstSeen: "csg2b:bid:firstSeenMap",
    newMap: "csg2b:bid:newMap",
    init: "csg2b:bid:newInitialized",
  },
  preSpec: {
    last: "csg2b:preSpec:lastSnapshotKeys",
    firstSeen: "csg2b:preSpec:firstSeenMap",
    newMap: "csg2b:preSpec:newMap",
    init: "csg2b:preSpec:newInitialized",
  },
};

/** "신규" 로 표시할 기간. 이번 수집에서 새로 등장한 공고는 24h 동안 유지. */
export const NEW_TTL_MS = 24 * 60 * 60 * 1000;
/** firstSeenMap 정리 임계값 — TTL × 30 (=30일). 단순 감사/디버깅용. */
const FIRST_SEEN_CLEANUP_MS = NEW_TTL_MS * 30;

export type NewMap = Record<string, number>;
export type FirstSeenMap = Record<string, number>;

// -------------------- safe storage helpers --------------------

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore — quota / 시크릿 모드
  }
}

function readStringArray(key: string): string[] {
  const raw = safeGet(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function readNumberMap(key: string): Record<string, number> {
  const raw = safeGet(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
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

function writeJson(key: string, value: unknown) {
  safeSet(key, JSON.stringify(value));
}

function readInit(scope: Scope): boolean {
  return safeGet(STORAGE_KEYS[scope].init) === "true";
}

function writeInit(scope: Scope, value: boolean) {
  if (value) safeSet(STORAGE_KEYS[scope].init, "true");
  else safeSet(STORAGE_KEYS[scope].init, "");
}

// -------------------- public API --------------------

/**
 * 현재 newMap 을 읽어온다. cleanup(24h 지난 entry 제거)도 같이 수행.
 *
 *  - 페이지가 캐시에서 즉시 그려지는 첫 페인트 등, fetch 가 아직 끝나지 않은 시점에서도
 *    공고에 isNew 플래그를 정확히 다시 부착하기 위해 사용한다.
 */
export function loadNewMap(scope: Scope, now: number = Date.now()): NewMap {
  const map = readNumberMap(STORAGE_KEYS[scope].newMap);
  const cutoff = now - NEW_TTL_MS;
  let dirty = false;
  for (const [k, ts] of Object.entries(map)) {
    if (ts < cutoff) {
      delete map[k];
      dirty = true;
    }
  }
  if (dirty) writeJson(STORAGE_KEYS[scope].newMap, map);
  return map;
}

/** announcementKey 가 24h 이내에 새로 등장한 키인지. */
export function isKeyNewInScope(
  scope: Scope,
  key: string,
  newMap: NewMap,
  now: number = Date.now(),
): boolean {
  const ts = newMap[key];
  if (typeof ts !== "number") return false;
  return now - ts <= NEW_TTL_MS;
}

/**
 * 이번 수집 결과의 announcementKey 배열을 받아 NEW 상태를 갱신한다.
 *
 *  - 최초 시드: lastSnapshotKeys / firstSeenMap 만 채우고 newMap 은 비워둔다 → 신규 0건.
 *  - 두 번째 호출부터: lastSnapshot 에 없던 key 만 newMap[key] = now 로 기록 → 24h 동안 NEW.
 *
 *  마지막에 lastSnapshotKeys 를 이번 키로 갱신해, "어제 있던 공고가 오늘도 있으면 신규 아님"을
 *  자연스럽게 보장한다.
 *
 * 반환값:
 *  - newKeys : 이번 호출에서 처음 등장한 key 배열 (수집 toast 등에 사용).
 *  - newMap  : 갱신된 newMap. 화면에 isNew 부착 시 사용.
 */
export function markNewItemsBySnapshot(
  scope: Scope,
  keys: string[],
  now: number = Date.now(),
): { newKeys: string[]; newMap: NewMap; firstSeenMap: FirstSeenMap } {
  const dedupedKeys = Array.from(new Set(keys.filter((k) => typeof k === "string" && k.length > 0)));
  const initialized = readInit(scope);

  // 24h 지난 newMap entry 자동 정리.
  const newMap = loadNewMap(scope, now);
  const firstSeenMap = readNumberMap(STORAGE_KEYS[scope].firstSeen);

  if (!initialized) {
    // 최초 진입 — 기준선만 저장, 신규 0건.
    writeJson(STORAGE_KEYS[scope].last, dedupedKeys);
    for (const k of dedupedKeys) {
      if (!(k in firstSeenMap)) firstSeenMap[k] = now;
    }
    writeJson(STORAGE_KEYS[scope].firstSeen, firstSeenMap);
    writeJson(STORAGE_KEYS[scope].newMap, {}); // 강제 초기화
    writeInit(scope, true);
    return { newKeys: [], newMap: {}, firstSeenMap };
  }

  const lastSnapshot = new Set(readStringArray(STORAGE_KEYS[scope].last));

  const newKeys: string[] = [];
  for (const k of dedupedKeys) {
    if (!(k in firstSeenMap)) firstSeenMap[k] = now;
    if (!lastSnapshot.has(k)) {
      // 이번 수집에서 새로 등장 — newMap 에 시각 기록 (이미 있으면 그대로 둠 → 24h 카운트 유지).
      if (!(k in newMap)) {
        newMap[k] = now;
        newKeys.push(k);
      }
    }
  }

  // firstSeenMap cleanup — 너무 오래된 record 는 제거.
  const oldCutoff = now - FIRST_SEEN_CLEANUP_MS;
  for (const [k, ts] of Object.entries(firstSeenMap)) {
    if (ts < oldCutoff) delete firstSeenMap[k];
  }

  // 다음 호출의 비교 기준.
  writeJson(STORAGE_KEYS[scope].last, dedupedKeys);
  writeJson(STORAGE_KEYS[scope].firstSeen, firstSeenMap);
  if (newKeys.length > 0) {
    writeJson(STORAGE_KEYS[scope].newMap, newMap);
  }

  return { newKeys, newMap, firstSeenMap };
}

/**
 * "신규 표시 초기화" 버튼.
 *  - 화면이 잘못된 데이터로 신규 폭발 / 첫 진입 폭주 등에서 사용자가 수동 복구.
 *  - 현재 화면에 들어와있는 keys 를 lastSnapshotKeys 로 강제 저장.
 *  - newMap 비우기 + firstSeenMap 에 새 entry 채워두기 + initialized=true.
 */
export function resetNewSnapshot(
  scope: Scope,
  currentKeys: string[],
  now: number = Date.now(),
): NewMap {
  const dedupedKeys = Array.from(
    new Set(currentKeys.filter((k) => typeof k === "string" && k.length > 0)),
  );
  const firstSeenMap = readNumberMap(STORAGE_KEYS[scope].firstSeen);
  for (const k of dedupedKeys) {
    if (!(k in firstSeenMap)) firstSeenMap[k] = now;
  }
  writeJson(STORAGE_KEYS[scope].last, dedupedKeys);
  writeJson(STORAGE_KEYS[scope].firstSeen, firstSeenMap);
  writeJson(STORAGE_KEYS[scope].newMap, {});
  writeInit(scope, true);
  return {};
}
