import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TestG2bResponse = {
  ok: boolean;
  requestUrlWithoutKey: string;
  status: number;
  contentType: string | null;
  sample: unknown;
  error: string | null;
  resultCode: string | null;
  resultMsg: string | null;
};

type G2bApiHeader = {
  resultCode?: string;
  resultMsg?: string;
};

function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.G2B_SERVICE_KEY?.trim()) {
    missing.push("G2B_SERVICE_KEY");
  }
  if (!process.env.G2B_API_BASE_URL?.trim()) {
    missing.push("G2B_API_BASE_URL");
  }
  return missing;
}

function getKstDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

/** 오늘 기준 30일 전 00:00 ~ 오늘 23:59 (KST, YYYYMMDDHHMM) */
function getInquiryDateRange() {
  const now = new Date();
  const endParts = getKstDateParts(now);
  const inqryEndDt = `${endParts.year}${endParts.month}${endParts.day}2359`;

  const beginDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const beginParts = getKstDateParts(beginDate);
  const inqryBgnDt = `${beginParts.year}${beginParts.month}${beginParts.day}0000`;

  return { inqryBgnDt, inqryEndDt };
}

function buildG2bRequestUrls(
  baseUrl: string,
  serviceKey: string,
  inqryBgnDt: string,
  inqryEndDt: string,
) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const endpoint = `${normalizedBase}/getBidPblancListInfoServc`;

  const commonParams = {
    pageNo: "1",
    numOfRows: "10",
    inqryDiv: "1",
    inqryBgnDt,
    inqryEndDt,
    type: "json",
  };

  const params = new URLSearchParams({
    serviceKey,
    ...commonParams,
  });

  const maskedParams = new URLSearchParams({
    serviceKey: "***",
    ...commonParams,
  });

  return {
    requestUrl: `${endpoint}?${params.toString()}`,
    requestUrlWithoutKey: `${endpoint}?${maskedParams.toString()}`,
  };
}

function sampleJson(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 3).map((item) => sampleJson(item, depth + 1));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 15);
    return Object.fromEntries(entries.map(([key, val]) => [key, sampleJson(val, depth + 1)]));
  }

  return value;
}

function extractG2bHeader(parsed: unknown): G2bApiHeader | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const response = (parsed as { response?: { header?: G2bApiHeader } }).response;
  return response?.header ?? null;
}

function missingEnvResponse(missing: string[]): NextResponse<TestG2bResponse> {
  return NextResponse.json({
    ok: false,
    requestUrlWithoutKey: "",
    status: 0,
    contentType: null,
    sample: { missingEnv: missing },
    error: `환경변수가 없습니다: ${missing.join(", ")}`,
    resultCode: null,
    resultMsg: null,
  });
}

export async function GET(): Promise<NextResponse<TestG2bResponse>> {
  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    return missingEnvResponse(missing);
  }

  const serviceKey = process.env.G2B_SERVICE_KEY!.trim();
  const baseUrl = process.env.G2B_API_BASE_URL!.trim();
  const { inqryBgnDt, inqryEndDt } = getInquiryDateRange();
  const { requestUrl, requestUrlWithoutKey } = buildG2bRequestUrls(
    baseUrl,
    serviceKey,
    inqryBgnDt,
    inqryEndDt,
  );

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json, text/plain, */*" },
    });

    const contentType = response.headers.get("content-type");
    const rawText = await response.text();

    let sample: unknown = null;
    let parseError: string | null = null;
    let resultCode: string | null = null;
    let resultMsg: string | null = null;

    const looksLikeJson =
      contentType?.includes("json") ||
      rawText.trim().startsWith("{") ||
      rawText.trim().startsWith("[");

    if (looksLikeJson) {
      try {
        const parsed: unknown = JSON.parse(rawText);
        const header = extractG2bHeader(parsed);
        resultCode = header?.resultCode ?? null;
        resultMsg = header?.resultMsg ?? null;
        sample = sampleJson(parsed);
      } catch {
        sample = rawText.slice(0, 1000);
        parseError = "JSON 파싱에 실패해 응답 원문 앞 1000자를 반환했습니다.";
      }
    } else {
      sample = rawText.slice(0, 1000);
    }

    const apiOk = resultCode === "00";
    const ok = response.ok && parseError === null && apiOk;

    let error: string | null = null;
    if (parseError) {
      error = parseError;
    } else if (!response.ok) {
      error = `HTTP ${response.status} ${response.statusText}`;
    } else if (!apiOk && resultMsg) {
      error = resultMsg;
    } else if (!apiOk) {
      error = `API resultCode: ${resultCode ?? "unknown"}`;
    }

    return NextResponse.json({
      ok,
      requestUrlWithoutKey,
      status: response.status,
      contentType,
      sample,
      error,
      resultCode,
      resultMsg,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      requestUrlWithoutKey,
      status: 0,
      contentType: null,
      sample: null,
      error: error instanceof Error ? error.message : String(error),
      resultCode: null,
      resultMsg: null,
    });
  }
}
