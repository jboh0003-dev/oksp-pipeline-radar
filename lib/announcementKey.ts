import type { Notice } from "@/data/sampleNotices";

/**
 * 공고를 사람 눈으로 같다고 보이는 단위(같은 입찰의 같은 차수)에서 1건으로 세기 위한 안정적 키.
 *
 * 우선순위:
 *  1. external_id (Supabase notices 테이블이 들고 있는 G2B 식별자) — 있으면 그대로 사용.
 *  2. raw_data 의 bidNtceNo + bidNtceOrd + reNtceYn 조합 (있을 때만).
 *  3. 마지막 fallback: 내부 DB id.
 *
 * key 가 같으면 "같은 공고" 로 본다. 페이징/재공고/source endpoint 차이로 row 가
 * 두 번 들어와도 1건으로 집계된다.
 *
 * 화면 단위에서만 dedup 하면 충분하므로 안정성 위주로 단순한 문자열 결합을 한다.
 */
export type AnnouncementKey = string;

export type AnnouncementKeySource = Notice & {
  externalId?: string | null;
  rawData?: string | null;
};

function pickRawField(rawData: string | null | undefined, keys: string[]): string | null {
  if (!rawData) return null;
  try {
    const parsed = JSON.parse(rawData) as Record<string, unknown>;
    for (const key of keys) {
      const v = parsed?.[key];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  } catch {
    // raw_data 가 JSON 이 아니면 무시
  }
  return null;
}

export function getAnnouncementKey(notice: AnnouncementKeySource): AnnouncementKey {
  const ext = notice.externalId?.toString().trim();
  if (ext) return `ext:${ext}`;

  const bidNo = pickRawField(notice.rawData, ["bidNtceNo"]);
  if (bidNo) {
    const ord = pickRawField(notice.rawData, ["bidNtceOrd"]) ?? "0";
    const re = pickRawField(notice.rawData, ["reNtceYn"]) ?? "N";
    return `bid:${bidNo}:${ord}:${re}`;
  }

  return `id:${notice.id}`;
}

/** 공고 배열을 announcementKey 기준으로 dedup. 첫 등장 row 만 남긴다. */
export function dedupeByAnnouncementKey<T extends AnnouncementKeySource>(notices: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const n of notices) {
    const key = getAnnouncementKey(n);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}
