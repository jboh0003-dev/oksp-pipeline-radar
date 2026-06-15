/**
 * "데이터 신선도" 판정 헬퍼.
 *
 * 자동 수집은 vercel.json 에 등록된 매일 08:30 KST 크론 한 번만 돈다 (= UTC 23:30).
 * 따라서 "직전 cron 시각" 이후로 한 번도 새 row 가 들어오지 않았다면
 * 그 데이터는 stale 로 본다.
 *
 *  - 모든 비교는 UTC ms 기준이라 OS 타임존 영향 없음.
 *  - 입찰공고 / 사전규격공고 양쪽에서 동일하게 사용한다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** "직전 자동수집 cutoff" — 매일 08:30 KST. 항상 과거의 가장 가까운 08:30 KST 시각을 반환. */
export function getLastMorningCutoffUtcMs(now: number = Date.now()): number {
  const kstNow = new Date(now + KST_OFFSET_MS);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();
  const kstHour = kstNow.getUTCHours();
  const kstMinute = kstNow.getUTCMinutes();

  // 오늘 KST 08:30 의 UTC ms.
  let cutoffUtcMs = Date.UTC(y, m, d, 8, 30, 0) - KST_OFFSET_MS;
  // 현재 KST 가 아직 08:30 전이라면 직전 cutoff 는 어제 08:30 KST.
  if (kstHour < 8 || (kstHour === 8 && kstMinute < 30)) {
    cutoffUtcMs -= ONE_DAY_MS;
  }
  return cutoffUtcMs;
}

/**
 * 마지막 fetch 시각이 "직전 08:30 KST cutoff" 보다 오래됐는지.
 *  - true 면 "업데이트 필요" 로 표시한다.
 *  - 입력이 0/NaN/undefined 이면 false (= 비어있음을 stale 로 보지 않음 — 호출 측이 별도로 안내).
 */
export function isStaleSinceMorningCutoff(
  lastFetchAt: number | null | undefined,
  now: number = Date.now(),
): boolean {
  if (lastFetchAt == null) return false;
  if (!Number.isFinite(lastFetchAt) || lastFetchAt <= 0) return false;
  return lastFetchAt < getLastMorningCutoffUtcMs(now);
}

/** ISO 문자열을 ms 로 안전 변환. 실패 시 null. */
export function parseIsoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** ISO 문자열이 stale 한지. (collection_runs.finished_at 같은 ISO 컬럼용) */
export function isIsoStaleSinceMorningCutoff(
  iso: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const ms = parseIsoToMs(iso);
  if (ms == null) return false;
  return isStaleSinceMorningCutoff(ms, now);
}

/** "n시간 m분 전" 형태의 사람 친화적 상대 시간 문자열. 미래/0초/N/A 는 "방금" 또는 "-". */
export function formatRelativeKstAgo(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  const ms = parseIsoToMs(iso);
  if (ms == null) return "-";
  const diffMs = now - ms;
  if (diffMs < 0) return "곧";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "방금";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    const remMin = diffMin - diffHour * 60;
    return remMin > 0 ? `${diffHour}시간 ${remMin}분 전` : `${diffHour}시간 전`;
  }
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}
