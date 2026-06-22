import { NextResponse } from "next/server";

/** 표준 API 성공 응답. */
export type ApiSuccessBody<T> = {
  ok: true;
  data: T;
  message?: string;
};

/** 표준 API 실패 응답. */
export type ApiErrorBody = {
  ok: false;
  error: string;
  detail?: string;
};

export type ParseApiResult<T> =
  | { ok: true; data: T; message?: string; status: number }
  | { ok: false; error: string; detail?: string; status: number };

/** 서버 — 성공 JSON 응답. */
export function jsonOk<T>(
  data: T,
  opts?: { message?: string; status?: number },
): NextResponse<ApiSuccessBody<T>> {
  const body: ApiSuccessBody<T> = { ok: true, data };
  if (opts?.message) body.message = opts.message;
  return NextResponse.json(body, { status: opts?.status ?? 200 });
}

/** 서버 — 실패 JSON 응답. plain text / HTML 응답을 절대 반환하지 않는다. */
export function jsonFail(
  error: string,
  opts?: { detail?: string; status?: number },
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { ok: false, error };
  if (opts?.detail) body.detail = opts.detail;
  return NextResponse.json(body, { status: opts?.status ?? 500 });
}

/** 서버 — route handler 최상위 try/catch 래퍼. */
export async function withApiRoute<T extends Response>(
  route: string,
  handler: () => Promise<T>,
): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[${route}] unhandled error:`, err);
    return jsonFail("요청 처리 중 오류가 발생했습니다.", { detail, status: 500 });
  }
}

type ParseContext = {
  route?: string;
  params?: unknown;
};

/**
 * 클라이언트 — fetch 응답을 안전하게 파싱한다.
 * - content-type / 본문 형태를 확인한 뒤 JSON 파싱.
 * - HTML·plain text(Vercel 500 등)는 사용자 친화 메시지로 변환.
 * - `{ ok, data }` 표준 형식과 레거시 직접 payload 모두 지원.
 */
export async function parseApiResponse<T>(
  res: Response,
  context?: ParseContext,
): Promise<ParseApiResult<T>> {
  const status = res.status;
  const route = context?.route ?? res.url;

  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[parseApiResponse] body read failed", { route, status, params: context?.params, detail });
    return {
      ok: false,
      status,
      error: "네트워크 응답을 읽지 못했습니다.",
      detail,
    };
  }

  const trimmed = text.trim();
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const looksJson =
    contentType.includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!looksJson) {
    console.error("[parseApiResponse] non-JSON response", {
      route,
      status,
      params: context?.params,
      contentType,
      preview: trimmed.slice(0, 300),
    });
    return {
      ok: false,
      status,
      error:
        status >= 500
          ? "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
          : "요청 처리 중 오류가 발생했습니다.",
      detail: trimmed.slice(0, 500),
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[parseApiResponse] JSON parse failed", {
      route,
      status,
      params: context?.params,
      detail,
      preview: trimmed.slice(0, 300),
    });
    return {
      ok: false,
      status,
      error: "응답 형식을 해석하지 못했습니다.",
      detail: `${detail} · ${trimmed.slice(0, 200)}`,
    };
  }

  if (!json || typeof json !== "object") {
    return {
      ok: false,
      status,
      error: "응답 형식을 해석하지 못했습니다.",
      detail: String(json).slice(0, 200),
    };
  }

  const rec = json as Record<string, unknown>;

  if (rec.ok === false) {
    console.error("[parseApiResponse] API error", {
      route,
      status,
      params: context?.params,
      error: rec.error,
      detail: rec.detail,
    });
    return {
      ok: false,
      status,
      error:
        typeof rec.error === "string"
          ? rec.error
          : "요청 처리 중 오류가 발생했습니다.",
      detail: typeof rec.detail === "string" ? rec.detail : undefined,
    };
  }

  if (rec.ok === true && "data" in rec) {
    return {
      ok: true,
      status,
      data: rec.data as T,
      message: typeof rec.message === "string" ? rec.message : undefined,
    };
  }

  // 레거시: { ok, ...fields } 또는 { matches, meta } 등 직접 payload
  if (!res.ok) {
    const errMsg =
      typeof rec.error === "string" ? rec.error : `HTTP ${status}`;
    console.error("[parseApiResponse] HTTP error (legacy body)", {
      route,
      status,
      params: context?.params,
      error: errMsg,
    });
    return {
      ok: false,
      status,
      error: errMsg,
      detail: JSON.stringify(rec).slice(0, 500),
    };
  }

  return {
    ok: true,
    status,
    data: json as T,
    message: typeof rec.message === "string" ? rec.message : undefined,
  };
}
