/** 공고명 후보 필드 (대소문자 무시 매칭) */
export const TITLE_FIELD_CANDIDATES = [
  "bidNtceNm",
  "bidNm",
  "ntceNm",
  "bsnsNm",
  "prdctClsfcNoNm",
  "purchsObjPrdctNm",
  "prdctNm",
  "dtlPrdctNm",
  "srvceNm",
  "cnsttyNm",
];

export const AGENCY_FIELD_CANDIDATES = ["dminsttNm", "ntceInsttNm", "ntceInsttOfclNm"];

function buildLowerKeyMap(item: Record<string, unknown>) {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(item)) {
    map.set(key.toLowerCase(), value);
  }
  return map;
}

export function getG2bField(item: Record<string, unknown>, candidates: string[]): string {
  const map = buildLowerKeyMap(item);
  for (const candidate of candidates) {
    const value = map.get(candidate.toLowerCase());
    if (value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

export function getG2bTitle(item: Record<string, unknown>): string {
  return getG2bField(item, TITLE_FIELD_CANDIDATES);
}

export function getG2bAgency(item: Record<string, unknown>): string {
  return getG2bField(item, AGENCY_FIELD_CANDIDATES) || "미상";
}

export function buildG2bRawTextPreview(item: Record<string, unknown>, maxLength = 240): string {
  const preview = [
    getG2bTitle(item),
    getG2bAgency(item),
    getG2bField(item, ["bsnsNm", "prdctNm", "purchsObjPrdctNm", "srvceNm"]),
  ]
    .filter(Boolean)
    .join(" | ");

  if (preview) {
    return preview.slice(0, maxLength);
  }

  return JSON.stringify(item).slice(0, maxLength);
}
