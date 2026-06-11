/**
 * G2B raw item 에서 첨부파일/RFP/규격서/과업지시서 정보를 추출하는 공통 helper.
 *
 *  - 입찰공고와 사전규격공고 raw 가 들고 있는 다양한 file 필드를 하나의 AttachmentInfo[] 로 정규화.
 *  - 파일명 또는 URL 에서 키워드를 추출해 type 을 결정 (RFP / 과업지시서 / 규격서 / 제안요청서 / 첨부파일 / 기타).
 *  - hasRfp / hasSpecDoc / hasTaskDoc 플래그도 같이 만들어 화면이 빠르게 분기 가능.
 */

export type AttachmentType =
  | "RFP"
  | "과업지시서"
  | "규격서"
  | "제안요청서"
  | "첨부파일"
  | "기타";

export type AttachmentInfo = {
  /** 파일 이름. URL 에서 마지막 segment 를 fallback 으로 사용. */
  name: string;
  /** 다운로드 또는 원문 URL. http(s) 만 유효한 것으로 간주. */
  url?: string;
  /** 파일명/URL 키워드로부터 판별한 분류. */
  type: AttachmentType;
};

/**
 * 파일명/URL 후보가 들어있을 수 있는 키들.
 *
 *  - filename / url 짝으로 들어오는 케이스 (atchFileNm / atchFileUrl 등)
 *  - 단일 url 만 있는 케이스 (specDocFileUrlN)
 *  - filename 만 있는 케이스 (atchFileNm)
 *
 * 가장 흔한 패턴은:
 *   - atchFileNm + atchFileUrl
 *   - specDocFileUrl1 ~ 5
 *   - rqstFileUrl / fileName
 *   - rfpFileUrl / rfpFileNm
 */
const FILENAME_KEYS = [
  "atchFileNm",
  "atchFileName",
  "atchFileNm1",
  "atchFileNm2",
  "atchFileNm3",
  "atchFileNm4",
  "atchFileNm5",
  "fileName",
  "fileNm",
  "specFileNm",
  "specDocFileNm",
  "ntceSpecDocFileNm",
  "rfpFileNm",
  "rqstFileNm",
];

const URL_KEYS = [
  "atchFileUrl",
  "atchFileUrl1",
  "atchFileUrl2",
  "atchFileUrl3",
  "atchFileUrl4",
  "atchFileUrl5",
  "fileUrl",
  "specFileUrl",
  "specDocFileUrl",
  "specDocFileUrl1",
  "specDocFileUrl2",
  "specDocFileUrl3",
  "specDocFileUrl4",
  "specDocFileUrl5",
  "ntceSpecDocFileUrl",
  "ntceSpecDocFileUrl1",
  "ntceSpecDocFileUrl2",
  "ntceSpecDocFileUrl3",
  "ntceSpecDocFileUrl4",
  "ntceSpecDocFileUrl5",
  "rfpFileUrl",
  "rqstFileUrl",
];

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value.trim());
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}

/** URL 의 마지막 path segment 또는 query 의 fileName 을 fallback 이름으로 사용. */
function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const fromQuery =
      u.searchParams.get("fileName") ??
      u.searchParams.get("fileNm") ??
      u.searchParams.get("name");
    if (fromQuery) return decodeURIComponent(fromQuery);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    /* fall through */
  }
  return url;
}

/** 파일명/URL 안에 들어 있는 키워드로 type 결정. */
export function classifyAttachmentType(
  nameOrUrl: string | undefined,
): AttachmentType {
  const text = (nameOrUrl ?? "").toLowerCase();
  if (!text) return "기타";

  // RFP / 제안요청서 (RFP 가 우선)
  if (text.includes("rfp")) return "RFP";
  if (text.includes("제안요청서") || text.includes("제안 요청서")) return "제안요청서";

  // 과업지시서
  if (text.includes("과업지시서") || text.includes("과업 지시서")) return "과업지시서";

  // 규격서 / 사양서 / 사전규격
  if (
    text.includes("규격서") ||
    text.includes("사양서") ||
    text.includes("사전규격") ||
    text.includes("specdoc") ||
    text.includes("spec_doc") ||
    text.includes("specdocfile")
  ) {
    return "규격서";
  }

  // 일반 첨부 / 붙임
  if (text.includes("붙임") || text.includes("첨부")) return "첨부파일";

  return "기타";
}

/**
 * raw item 에서 가능한 모든 첨부 후보를 추출.
 *
 *  1) atchFileNmN ↔ atchFileUrlN 짝
 *  2) specDocFileUrl1~5 (이름 없으면 URL 의 마지막 segment 사용)
 *  3) rfp / 과업 / 제안요청서 등 별도 필드
 *  4) 같은 URL 이 여러 번 나오면 dedup.
 */
export function extractAttachments(
  raw: Record<string, unknown> | null | undefined,
): AttachmentInfo[] {
  if (!raw) return [];
  const list: AttachmentInfo[] = [];
  const seenUrls = new Set<string>();
  const seenNamesNoUrl = new Set<string>();

  // 1) name/url pair 후보. 인덱스가 같은 짝으로 추정해 묶는다 (atchFileNm1 + atchFileUrl1 식).
  const nameByIndex: Record<number, string> = {};
  const urlByIndex: Record<number, string> = {};
  for (const key of FILENAME_KEYS) {
    const v = readString(raw, key);
    if (!v) continue;
    const idx = Number(key.replace(/[^0-9]/g, "")) || 0;
    nameByIndex[idx] = nameByIndex[idx] ?? v;
  }
  for (const key of URL_KEYS) {
    const v = readString(raw, key);
    if (!v) continue;
    if (!isHttpUrl(v)) continue;
    const idx = Number(key.replace(/[^0-9]/g, "")) || 0;
    urlByIndex[idx] = urlByIndex[idx] ?? v;
  }

  const indices = new Set<number>([
    ...Object.keys(nameByIndex).map(Number),
    ...Object.keys(urlByIndex).map(Number),
  ]);
  for (const idx of [...indices].sort((a, b) => a - b)) {
    const name = nameByIndex[idx];
    const url = urlByIndex[idx];
    const finalName = name ?? (url ? nameFromUrl(url) : undefined);
    const finalUrl = url;
    if (!finalName && !finalUrl) continue;

    if (finalUrl) {
      if (seenUrls.has(finalUrl)) continue;
      seenUrls.add(finalUrl);
    } else if (finalName) {
      if (seenNamesNoUrl.has(finalName)) continue;
      seenNamesNoUrl.add(finalName);
    }

    list.push({
      name: finalName ?? "(이름 없음)",
      url: finalUrl,
      type: classifyAttachmentType(finalName ?? finalUrl),
    });
  }

  // 2) 부가 필드 — RFP/과업/제안요청서 같은 명시적 후보. 이미 seenUrls 에 있는 것은 skip.
  const extras: Array<{ nameKey: string; urlKey: string; type: AttachmentType }> = [
    { nameKey: "rfpFileNm", urlKey: "rfpFileUrl", type: "RFP" },
    { nameKey: "rqstFileNm", urlKey: "rqstFileUrl", type: "제안요청서" },
  ];
  for (const e of extras) {
    const name = readString(raw, e.nameKey);
    const url = readString(raw, e.urlKey);
    if (!name && !url) continue;
    if (url && !isHttpUrl(url)) continue;
    if (url && seenUrls.has(url)) continue;
    if (url) seenUrls.add(url);
    list.push({
      name: name ?? (url ? nameFromUrl(url) : "(이름 없음)"),
      url,
      type: e.type,
    });
  }

  return list;
}

/** 첨부에 RFP/규격서/과업지시서가 포함됐는지 빠르게 확인. */
export function summarizeAttachments(list: AttachmentInfo[]): {
  hasRfp: boolean;
  hasSpecDoc: boolean;
  hasTaskDoc: boolean;
  rfpUrl?: string;
  specDocUrl?: string;
  taskDocUrl?: string;
} {
  let hasRfp = false;
  let hasSpecDoc = false;
  let hasTaskDoc = false;
  let rfpUrl: string | undefined;
  let specDocUrl: string | undefined;
  let taskDocUrl: string | undefined;
  for (const a of list) {
    if (a.type === "RFP" || a.type === "제안요청서") {
      hasRfp = true;
      rfpUrl = rfpUrl ?? a.url;
    } else if (a.type === "규격서") {
      hasSpecDoc = true;
      specDocUrl = specDocUrl ?? a.url;
    } else if (a.type === "과업지시서") {
      hasTaskDoc = true;
      taskDocUrl = taskDocUrl ?? a.url;
    }
  }
  return { hasRfp, hasSpecDoc, hasTaskDoc, rfpUrl, specDocUrl, taskDocUrl };
}
