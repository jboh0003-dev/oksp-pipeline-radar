import { NextResponse } from "next/server";
import { makeCollectionError, type CollectionError } from "@/lib/collectionErrors";
import {
  DEFAULT_PRE_SPEC_CATEGORIES,
  fetchPreSpecAnnouncements,
  getInquiryRangeYyyymmdd,
  type PreSpecCategory,
} from "@/lib/preSpec/api";
import { normalizePreSpecItem } from "@/lib/preSpec/normalize";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

/**
 * GET /api/pre-spec/collect
 *
 * Query 파라미터:
 *   days     : 1..90, 기본 7
 *              (G2B API 가 rcptDt ASC 정렬이라 days 가 너무 길면 maxPages 한도 안에
 *               가장 오래된 페이지만 들어와 진행중 데이터가 화면에 안 보인다.
 *               의견접수기간이 보통 5~7일이라 7일이면 거의 모든 진행중/마감임박 항목 커버.)
 *   cats     : 콤마 구분 PreSpecCategory ("servc,thng,cnstwk,frgcpt"). 기본 servc+thng.
 *   maxPages : 카테고리당 최대 페이지 수 (기본 5, 1..50)
 *
 * 응답 (성공):
 *   {
 *     ok: true,
 *     items: PreSpecAnnouncement[],
 *     totalsByCategory,
 *     errors,
 *     inqryBgnDt, inqryEndDt, days, cats,
 *     debug: { firstItemKeys, firstItemSample },
 *     durationMs
 *   }
 *
 * 응답 (실패):
 *   { ok: false, error: <message>, items: [], errors: [...] }
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_CATS: PreSpecCategory[] = ["servc", "thng", "cnstwk", "frgcpt"];

function parseCats(raw: string | null): PreSpecCategory[] {
  if (!raw) return DEFAULT_PRE_SPEC_CATEGORIES;
  const parts = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean) as PreSpecCategory[];
  const filtered = parts.filter((p): p is PreSpecCategory => ALLOWED_CATS.includes(p));
  return filtered.length > 0 ? filtered : DEFAULT_PRE_SPEC_CATEGORIES;
}

function parseInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days"), 7, 1, 90);
  const cats = parseCats(url.searchParams.get("cats"));
  const maxPagesPerCategory = parseInt(url.searchParams.get("maxPages"), 5, 1, 50);

  const serviceKey = process.env.G2B_SERVICE_KEY;
  if (!serviceKey) {
    const err: CollectionError = makeCollectionError({
      scope: "PRE_SPEC",
      kind: "API_KEY_MISSING",
      message: "G2B service key가 설정되지 않았습니다.",
    });
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        items: [],
        totalsByCategory: {},
        errors: ["missing_service_key"],
        collectionErrors: [err],
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }

  const { inqryBgnDt, inqryEndDt } = getInquiryRangeYyyymmdd(days);

  const collectionErrors: CollectionError[] = [];
  let result;
  try {
    result = await fetchPreSpecAnnouncements(serviceKey, {
      inqryBgnDt,
      inqryEndDt,
      categories: cats,
      maxPagesPerCategory,
      concurrency: 3,
    });
  } catch (err) {
    const ce = makeCollectionError({
      scope: "PRE_SPEC",
      kind: "UNKNOWN_ERROR",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        error: ce.message,
        items: [],
        totalsByCategory: {},
        errors: ["fetch_failed"],
        collectionErrors: [ce],
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }

  // 페이지 단위 에러 → CollectionError 로 변환.
  for (const pe of result.pageErrors) {
    const lowered = pe.message.toLowerCase();
    const kind = lowered.includes("timeout")
      ? "API_TIMEOUT"
      : lowered.includes("json")
        ? "JSON_PARSE_ERROR"
        : "API_RESPONSE_ERROR";
    collectionErrors.push(
      makeCollectionError({
        scope: "PRE_SPEC",
        kind,
        endpoint: `${pe.category}/${pe.endpoint}`,
        pageNo: pe.pageNo,
        message: pe.message,
      }),
    );
  }

  // 정규화 + dedup (announcementKey 기준)
  const seen = new Set<string>();
  const items: PreSpecAnnouncement[] = [];
  let i = 0;
  for (const raw of result.items) {
    const fallback = `pre-spec-${i++}`;
    let norm: PreSpecAnnouncement;
    try {
      const meta = raw as { __sourceApi?: string; __sourceEndpoint?: string };
      norm = normalizePreSpecItem(raw, fallback, {
        sourceApi: meta.__sourceApi,
        sourceEndpoint: meta.__sourceEndpoint,
      });
    } catch (err) {
      // 단건 정규화 실패는 errors 에 기록하고 계속.
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`[normalize] ${message}`);
      collectionErrors.push(
        makeCollectionError({
          scope: "PRE_SPEC",
          kind: "NORMALIZE_ERROR",
          message: `정규화 실패: ${message}`,
        }),
      );
      continue;
    }
    if (!norm.announcementKey || seen.has(norm.announcementKey)) continue;
    seen.add(norm.announcementKey);
    items.push(norm);
  }

  const durationMs = Date.now() - startedAt;
  // 데이터가 0건 + 페이지 에러도 0개면 "조건에 맞는 결과 없음" 으로 안내.
  const noData = items.length === 0 && result.errors.length === 0;

  return NextResponse.json({
    ok: !noData || result.errors.length === 0, // 에러가 있으면 ok=false 로 판단되도록
    items,
    totalsByCategory: result.totalsByCategory,
    errors: result.errors,
    collectionErrors,
    message: noData ? "조건에 맞는 사전규격공고가 없습니다." : undefined,
    inqryBgnDt,
    inqryEndDt,
    days,
    cats,
    debug: {
      firstItemKeys: result.firstItemKeys,
      firstItemSample: result.firstItemSample,
      pageCount: result.pages.length,
    },
    durationMs,
  });
}
