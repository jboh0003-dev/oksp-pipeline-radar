/**
 * 수집 단계의 모든 오류를 한 곳에서 관리하기 위한 공통 타입.
 *
 *  - 입찰공고 / 사전규격공고 양쪽이 같은 형태로 오류를 모은다.
 *  - 화면(CollectionErrorPanel) 에서 이 배열을 읽어 사용자에게 노출.
 *  - 한 endpoint 가 실패해도 다른 endpoint 는 계속 동작 → 가능한 데이터는 화면에 표시.
 */

export type CollectionErrorScope = "BID" | "PRE_SPEC";

export type CollectionErrorKind =
  | "API_KEY_MISSING"
  | "API_TIMEOUT"
  | "API_RESPONSE_ERROR"
  | "JSON_PARSE_ERROR"
  | "EMPTY_ITEMS"
  | "ATTACHMENT_URL_ERROR"
  | "NORMALIZE_ERROR"
  | "UNKNOWN_ERROR";

export type CollectionError = {
  /** 화면 dedup / key 용. */
  id: string;
  scope: CollectionErrorScope;
  kind: CollectionErrorKind;
  /** API endpoint 또는 라벨 (예: "사전규격(servc)"). */
  endpoint?: string;
  /** 실패한 페이지 번호. */
  pageNo?: number;
  /** 한 줄 요약 — 화면에 항상 보여줄 message. */
  message: string;
  /** 상세 디버그 (URL, body 등). 접힌 영역에서만 노출. */
  detail?: string;
  /** ISO 시각. */
  createdAt: string;
};

/**
 * G2B client 의 errorKind / message 를 CollectionError 로 변환.
 */
export function makeCollectionError(input: {
  scope: CollectionErrorScope;
  kind: CollectionErrorKind;
  endpoint?: string;
  pageNo?: number;
  message: string;
  detail?: string;
}): CollectionError {
  const id = [
    input.scope,
    input.kind,
    input.endpoint ?? "",
    input.pageNo ?? "",
    input.message.slice(0, 50),
  ].join("|");
  return {
    id,
    scope: input.scope,
    kind: input.kind,
    endpoint: input.endpoint,
    pageNo: input.pageNo,
    message: input.message,
    detail: input.detail,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 수집 오류 메시지 목록에서 같은 내용을 제거한다.
 *
 * 502 처럼 여러 페이지에서 동일하게 실패하면 "…p1: HTTP 502", "…p2: HTTP 502" 가 각각 쌓여
 * 화면과 collection_runs 에 같은 내용이 반복 저장된다. 페이지 번호만 다른 메시지는
 * 하나로 합쳐 첫 메시지만 남긴다.
 */
export function dedupeCollectionMessages(messages: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of messages) {
    const message = raw.trim();
    if (!message) continue;
    const key = message.replace(/\bp\d+\b/g, "p*").slice(0, 300);
    if (!seen.has(key)) seen.set(key, message);
  }
  return [...seen.values()];
}

const KIND_LABEL: Record<CollectionErrorKind, string> = {
  API_KEY_MISSING: "API 키 누락",
  API_TIMEOUT: "API 응답 timeout",
  API_RESPONSE_ERROR: "API 응답 오류",
  JSON_PARSE_ERROR: "응답 파싱 실패",
  EMPTY_ITEMS: "결과 없음",
  ATTACHMENT_URL_ERROR: "첨부 URL 이상",
  NORMALIZE_ERROR: "정규화 실패",
  UNKNOWN_ERROR: "알 수 없는 오류",
};

export function getCollectionErrorKindLabel(kind: CollectionErrorKind): string {
  return KIND_LABEL[kind] ?? kind;
}

/** 같은 endpoint+kind 의 오류는 합치고, 페이지 번호만 잘 정리해서 보여주기 위한 helper. */
export function summarizeErrors(errors: CollectionError[]): {
  total: number;
  byKind: Record<CollectionErrorKind, number>;
  byEndpoint: Record<string, number>;
} {
  const byKind = {} as Record<CollectionErrorKind, number>;
  const byEndpoint: Record<string, number> = {};
  for (const e of errors) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    const ep = e.endpoint ?? "(unknown)";
    byEndpoint[ep] = (byEndpoint[ep] ?? 0) + 1;
  }
  return { total: errors.length, byKind, byEndpoint };
}
