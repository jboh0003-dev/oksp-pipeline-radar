/**
 * 화면 측 localStorage 캐시 초기화 helper.
 *
 *  - 입찰공고 / 사전규격공고가 각자 별도 키 공간을 쓰고 있어, 한쪽만 비우거나 양쪽 모두 비우는
 *    선택지를 제공한다. (피드백 / 관심 등 사용자 작성 데이터는 보존)
 *  - SSR 가드 + try/catch — quota / 시크릿 모드 등에서도 안전.
 *
 * 화면 사용 방식:
 *  1) "캐시 초기화" 버튼 클릭 → 해당 scope 의 키 삭제
 *  2) window.location.reload() — 다음 마운트에서 fresh fetch + 새 lastFetchAt 저장.
 */

const BID_KEYS = [
  // 입찰 공고 데이터/시간/소스
  "csg2b:notices",
  "csg2b:lastFetchAt",
  "csg2b:lastSource",
  // NEW snapshot 관련 (lib/newState.ts)
  "csg2b:bid:lastSnapshotKeys",
  "csg2b:bid:firstSeenMap",
  "csg2b:bid:newMap",
  "csg2b:bid:newInitialized",
];

const PRE_SPEC_KEYS = [
  // 사전규격 데이터/시간 (lib/preSpec/cache.ts)
  "csg2b:preSpec:items",
  "csg2b:preSpec:lastFetchAt",
  "csg2b:preSpec:lastDurationMs",
  "csg2b:preSpec:items.v2",
  "csg2b:preSpec:lastFetchAt.v2",
  "csg2b:preSpec:lastDurationMs.v2",
  // NEW snapshot 관련 (lib/newState.ts)
  "csg2b:preSpec:lastSnapshotKeys",
  "csg2b:preSpec:firstSeenMap",
  "csg2b:preSpec:newMap",
  "csg2b:preSpec:newInitialized",
];

function safeRemove(keys: string[]) {
  if (typeof window === "undefined") return;
  for (const k of keys) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* quota / 시크릿 모드 — ignore */
    }
  }
}

export function clearBidLocalCache() {
  safeRemove(BID_KEYS);
}

export function clearPreSpecLocalCache() {
  safeRemove(PRE_SPEC_KEYS);
}

export function clearAllLocalCache() {
  safeRemove(BID_KEYS);
  safeRemove(PRE_SPEC_KEYS);
}
