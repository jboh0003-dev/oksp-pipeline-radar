import { NextResponse } from "next/server";
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
 * 쿼리:
 *  - days       : 조회 기간 (기본 30, 옵션 7/30/90)
 *  - cats       : 콤마 구분된 PreSpecCategory ("servc,thng" 등). 기본은 servc+thng.
 *  - maxPages   : 카테고리당 최대 페이지 수 (기본 5)
 *
 * 응답:
 *  - ok, items: PreSpecAnnouncement[], totalsByCategory, errors, durationMs
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
  const days = parseInt(url.searchParams.get("days"), 30, 1, 90);
  const cats = parseCats(url.searchParams.get("cats"));
  const maxPagesPerCategory = parseInt(url.searchParams.get("maxPages"), 5, 1, 20);

  const serviceKey = process.env.G2B_SERVICE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "G2B_SERVICE_KEY 환경변수가 설정되어 있지 않습니다.",
        items: [],
        totalsByCategory: {},
        errors: ["missing_service_key"],
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }

  const { inqryBgnDt, inqryEndDt } = getInquiryRangeYyyymmdd(days);

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
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        items: [],
        totalsByCategory: {},
        errors: ["fetch_failed"],
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }

  // 정규화 + dedup (announcementKey 기준).
  const seen = new Set<string>();
  const items: PreSpecAnnouncement[] = [];
  let i = 0;
  for (const raw of result.items) {
    const fallback = `pre-spec-${i++}`;
    const norm = normalizePreSpecItem(raw, fallback);
    if (!norm.announcementKey || seen.has(norm.announcementKey)) continue;
    seen.add(norm.announcementKey);
    items.push(norm);
  }

  const durationMs = Date.now() - startedAt;
  const ok = items.length > 0 || result.errors.length === 0;

  return NextResponse.json({
    ok,
    items,
    totalsByCategory: result.totalsByCategory,
    errors: result.errors,
    inqryBgnDt,
    inqryEndDt,
    days,
    cats,
    durationMs,
  });
}
