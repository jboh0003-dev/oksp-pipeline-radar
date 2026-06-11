/**
 * 나라장터(G2B) Open API 호출용 공통 client.
 *
 * 입찰공고와 사전규격공고가 모두 이 client 를 통해서 호출하도록 통일.
 *
 * 보장하는 동작:
 *  - timeout (AbortController 기반, 기본 15s)
 *  - retry (지수 백오프, 기본 3회)
 *  - resultCode/resultMsg 검사 (header.resultCode !== "00" 이면 에러)
 *  - JSON 파싱 실패 캐치
 *  - serviceKey 인코딩 이슈 대응 (이미 인코딩된 키가 들어와도 다시 인코딩하지 않음)
 *
 * 반환은 항상 {ok, data, error, debug} 형태. 호출부가 ok=false 라도 페이지 단위로
 * 처리할 수 있게 throw 대신 결과 객체로 전달한다.
 */

export type G2bResultHeader = {
  resultCode?: string;
  resultMsg?: string;
};

export type G2bResponseBody = {
  totalCount?: number | string;
  pageNo?: number | string;
  numOfRows?: number | string;
  items?: unknown;
};

export type G2bResponse = {
  response?: {
    header?: G2bResultHeader;
    body?: G2bResponseBody;
  };
};

export type G2bRequestOptions = {
  /** 요청별 timeout(ms). 기본 15000. */
  timeoutMs?: number;
  /** retry 시도 횟수. 기본 3. (최초 1회 + 추가 retry 2회) */
  retries?: number;
  /** retry 사이 base delay(ms). 실제 delay 는 base * 2^attempt + jitter. */
  retryBaseDelayMs?: number;
  /** UA / Accept 등 추가 헤더. */
  headers?: Record<string, string>;
  /** 호출 식별용 라벨 — 디버깅 / 로그에 사용. */
  label?: string;
};

export type G2bRequestDebug = {
  url: string;
  attempts: number;
  durationMs: number;
  status: number | null;
  resultCode: string | null;
  resultMsg: string | null;
  totalCount: number | null;
  itemCount: number;
};

export type G2bSuccess<T = G2bResponse> = {
  ok: true;
  data: T;
  raw: string;
  debug: G2bRequestDebug;
};

export type G2bFailure = {
  ok: false;
  error: string;
  /** 에러 분류 — 호출부가 CollectionError 로 매핑할 때 사용. */
  errorKind:
    | "API_KEY_MISSING"
    | "API_TIMEOUT"
    | "API_RESPONSE_ERROR"
    | "JSON_PARSE_ERROR"
    | "EMPTY_ITEMS"
    | "UNKNOWN_ERROR";
  debug: G2bRequestDebug;
};

export type G2bResult<T = G2bResponse> = G2bSuccess<T> | G2bFailure;

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 600;

/**
 * 이미 URL-encoded 된 serviceKey 가 들어와도 그대로 보존하기 위해 manual 한 query string 을 만든다.
 * URL.searchParams.set 은 값을 다시 인코딩하므로, "%2B" 같은 문자가 "%252B" 로 깨질 수 있다.
 *
 * 룰:
 *  - 키와 값 모두 이미 인코딩된 형태로 들어온다고 가정하지 않고, 일반 텍스트로 들어왔을 때
 *    encodeURIComponent 로 인코딩한다.
 *  - 단, serviceKey 는 이미 % 가 포함된 경우(이미 인코딩됨) 인코딩을 건너뛴다.
 */
function buildQueryString(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw == null) continue;
    const value = String(raw);
    let encoded: string;
    if (key === "serviceKey" && /%[0-9A-Fa-f]{2}/.test(value)) {
      // 이미 URL-encoded 된 키 — 두 번 인코딩 방지.
      encoded = value;
    } else {
      encoded = encodeURIComponent(value);
    }
    parts.push(`${encodeURIComponent(key)}=${encoded}`);
  }
  return parts.join("&");
}

export function buildG2bUrl(
  baseUrl: string,
  endpoint: string,
  params: Record<string, string | number | undefined>,
): string {
  const trimmedBase = baseUrl.replace(/\/$/, "");
  const trimmedEndpoint = endpoint.replace(/^\//, "");
  const qs = buildQueryString(params);
  return `${trimmedBase}/${trimmedEndpoint}${qs ? `?${qs}` : ""}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readHeader(parsed: unknown): G2bResultHeader | null {
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  const response = root.response as Record<string, unknown> | undefined;
  if (response && typeof response === "object") {
    const header = (response as { header?: G2bResultHeader }).header;
    if (header) return header;
  }
  if (root.header && typeof root.header === "object") {
    return root.header as G2bResultHeader;
  }
  return null;
}

function readTotalCount(parsed: unknown): number | null {
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  const response = (root.response as Record<string, unknown> | undefined) ?? root;
  const body = response.body as Record<string, unknown> | undefined;
  if (!body) return null;
  const total = body.totalCount;
  if (typeof total === "number") return total;
  if (typeof total === "string") {
    const n = Number(total);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function buildDebug(
  url: string,
  attempts: number,
  durationMs: number,
  status: number | null,
  parsed: unknown,
  itemCount: number,
): G2bRequestDebug {
  const header = readHeader(parsed);
  const totalCount = readTotalCount(parsed);
  return {
    url,
    attempts,
    durationMs,
    status,
    resultCode: header?.resultCode ?? null,
    resultMsg: header?.resultMsg ?? null,
    totalCount,
    itemCount,
  };
}

/**
 * G2B Open API 단일 호출.
 *
 *  - 5xx / 네트워크 / timeout 에는 retry. 4xx 는 즉시 실패 처리.
 *  - HTTP 200 + body.header.resultCode !== "00" 도 실패 처리.
 *  - parsing 실패 시 JSON_PARSE_ERROR.
 *
 *  반환: G2bResult — 성공이면 data, 실패면 error/errorKind. 어느 쪽이든 debug 가 채워진다.
 */
export async function fetchG2bApi(
  url: string,
  options: G2bRequestOptions = {},
): Promise<G2bResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.max(1, options.retries ?? DEFAULT_RETRIES);
  const baseDelay = options.retryBaseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    ...options.headers,
  };

  let lastError = "";
  let lastErrorKind: G2bFailure["errorKind"] = "UNKNOWN_ERROR";
  let lastStatus: number | null = null;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers,
      });
      clearTimeout(timer);

      const status = response.status;
      lastStatus = status;
      const text = await response.text();

      // 4xx 는 retry 의미가 없음 → 즉시 종료.
      if (status >= 400 && status < 500) {
        return {
          ok: false,
          errorKind: status === 401 || status === 403 ? "API_KEY_MISSING" : "API_RESPONSE_ERROR",
          error: `HTTP ${status} · ${text.slice(0, 200)}`,
          debug: buildDebug(url, attempt, Date.now() - startedAt, status, null, 0),
        };
      }

      // 5xx / 200 모두 일단 파싱 시도.
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // body 가 XML 등 — 파싱 불가. 5xx 면 retry, 200 이면 즉시 JSON_PARSE_ERROR.
        if (status >= 500) {
          lastError = `HTTP ${status} (JSON 아닌 응답): ${text.slice(0, 120)}`;
          lastErrorKind = "API_RESPONSE_ERROR";
          if (attempt < retries) {
            await sleep(baseDelay * 2 ** (attempt - 1) + Math.random() * 200);
            continue;
          }
          return {
            ok: false,
            errorKind: lastErrorKind,
            error: lastError,
            debug: buildDebug(url, attempt, Date.now() - startedAt, status, null, 0),
          };
        }
        return {
          ok: false,
          errorKind: "JSON_PARSE_ERROR",
          error: `JSON 파싱 실패 · ${text.slice(0, 200)}`,
          debug: buildDebug(url, attempt, Date.now() - startedAt, status, null, 0),
        };
      }

      const header = readHeader(parsed);
      if (status >= 500) {
        lastError = `HTTP ${status} · ${header?.resultMsg ?? ""}`;
        lastErrorKind = "API_RESPONSE_ERROR";
        if (attempt < retries) {
          await sleep(baseDelay * 2 ** (attempt - 1) + Math.random() * 200);
          continue;
        }
        return {
          ok: false,
          errorKind: lastErrorKind,
          error: lastError,
          debug: buildDebug(url, attempt, Date.now() - startedAt, status, parsed, 0),
        };
      }

      // resultCode 검사 — "00" 이외는 실패. (단, 일부 응답은 header 자체가 비어 있을 수 있음 → 그대로 ok)
      if (header && header.resultCode && header.resultCode !== "00") {
        // 30/12/11 등 키 미인증 / 일일 한도 초과 — 호출부가 errorKind 으로 분기 가능.
        const code = header.resultCode;
        const kind: G2bFailure["errorKind"] =
          code === "30" || code === "31" ? "API_KEY_MISSING" : "API_RESPONSE_ERROR";
        return {
          ok: false,
          errorKind: kind,
          error: `${code} · ${header.resultMsg ?? "API 오류"}`,
          debug: buildDebug(url, attempt, Date.now() - startedAt, status, parsed, 0),
        };
      }

      // 정상 응답.
      return {
        ok: true,
        data: parsed as G2bResponse,
        raw: text,
        debug: buildDebug(url, attempt, Date.now() - startedAt, status, parsed, 0),
      };
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastError = isAbort
        ? `요청 timeout (${timeoutMs}ms 초과)`
        : err instanceof Error
          ? err.message
          : String(err);
      lastErrorKind = isAbort ? "API_TIMEOUT" : "UNKNOWN_ERROR";
      if (attempt < retries) {
        await sleep(baseDelay * 2 ** (attempt - 1) + Math.random() * 200);
        continue;
      }
      return {
        ok: false,
        errorKind: lastErrorKind,
        error: lastError,
        debug: buildDebug(url, attempt, Date.now() - startedAt, lastStatus, null, 0),
      };
    }
  }

  // 도달 불가 — 안전 fallback.
  return {
    ok: false,
    errorKind: lastErrorKind,
    error: lastError || "알 수 없는 오류",
    debug: buildDebug(url, retries, Date.now() - startedAt, lastStatus, null, 0),
  };
}

/**
 * `(parsed) => items[]` 형태의 정규화 함수와 함께 호출 — 자주 쓰는 한 번 더 감싼 helper.
 * items 정규화는 lib/g2b/normalize.ts 의 normalizeItems 를 사용한다.
 */
export function getResponseHeader(parsed: unknown): G2bResultHeader | null {
  return readHeader(parsed);
}

export function getResponseTotalCount(parsed: unknown): number | null {
  return readTotalCount(parsed);
}
