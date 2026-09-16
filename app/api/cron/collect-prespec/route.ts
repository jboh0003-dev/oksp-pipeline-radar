import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PRE_SPEC_CATEGORIES,
  fetchPreSpecAnnouncements,
  getInquiryRangeYyyymmdd,
} from "@/lib/preSpec/api";
import { normalizePreSpecItem } from "@/lib/preSpec/normalize";
import { upsertPreSpecNotices } from "@/lib/preSpec/persist";
import { resolvePreSpecServiceKey } from "@/lib/preSpec/serviceKey";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest, expected: string): boolean {
  const bearer = request.headers.get("authorization") ?? "";
  if (bearer === `Bearer ${expected}`) return true;
  return (request.headers.get("x-cron-secret") ?? "").trim() === expected;
}

async function handle(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET 환경변수가 설정되어 있지 않습니다." },
      { status: 500 },
    );
  }
  if (!isAuthorized(request, expectedSecret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const errors: string[] = [];
  const keyResolution = resolvePreSpecServiceKey();

  if (!keyResolution.present) {
    return NextResponse.json(
      { ok: false, error: "사전규격 ServiceKey가 설정되어 있지 않습니다." },
      { status: 500 },
    );
  }

  const { inqryBgnDt, inqryEndDt } = getInquiryRangeYyyymmdd(7);
  let fetchedCount = 0;
  let normalizedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  try {
    const raw = await fetchPreSpecAnnouncements(keyResolution.key, {
      inqryBgnDt,
      inqryEndDt,
      categories: DEFAULT_PRE_SPEC_CATEGORIES,
      maxPagesPerCategory: 5,
      concurrency: 3,
    });

    fetchedCount = raw.items.length;
    for (const error of raw.errors) errors.push(`사전규격 페이지 오류: ${error}`);

    const seen = new Set<string>();
    const items: PreSpecAnnouncement[] = [];
    let index = 0;
    for (const rawItem of raw.items) {
      try {
        const meta = rawItem as { __sourceApi?: string; __sourceEndpoint?: string };
        const normalized = normalizePreSpecItem(rawItem, `pre-spec-${index++}`, {
          sourceApi: meta.__sourceApi,
          sourceEndpoint: meta.__sourceEndpoint,
        });
        if (!normalized.announcementKey || seen.has(normalized.announcementKey)) continue;
        seen.add(normalized.announcementKey);
        items.push(normalized);
      } catch (error) {
        errors.push(`정규화 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    normalizedCount = items.length;

    const upsert = await upsertPreSpecNotices(items);
    insertedCount = upsert.inserted;
    updatedCount = upsert.updated;
    skippedCount = upsert.skipped;
    for (const error of upsert.errors) errors.push(`DB 저장: ${error}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const finishedAt = new Date().toISOString();
  const ok = errors.length === 0;
  const supabase = getSupabaseAdmin();
  let dbLogError: string | null = null;

  if (supabase) {
    const { error } = await supabase.from("collection_runs").insert({
      source: "pre_spec",
      started_at: startedAt,
      finished_at: finishedAt,
      ok,
      target_count: 0,
      page_start: 1,
      page_end: null,
      fetched_count: fetchedCount,
      matched_count: normalizedCount,
      saved_count: insertedCount + updatedCount,
      skipped_expired_count: 0,
      skipped_no_product_count: skippedCount,
      errors,
      warnings: [
        `dedicated-prespec-cron · lookback=7일 · serviceKey=${keyResolution.source ?? "unknown"}`,
      ],
    } as never);
    if (error) {
      dbLogError = [error.message, error.code, error.details, error.hint]
        .filter(Boolean)
        .join(" | ");
    }
  } else {
    dbLogError = "Supabase admin client unavailable";
  }

  console.log("[/api/cron/collect-prespec] done", {
    ok,
    fetchedCount,
    normalizedCount,
    insertedCount,
    updatedCount,
    skippedCount,
    durationMs: Date.now() - startedMs,
    errorCount: errors.length,
    dbLogError,
  });

  return NextResponse.json({
    ok,
    startedAt,
    finishedAt,
    fetchedCount,
    normalizedCount,
    insertedCount,
    updatedCount,
    skippedCount,
    durationMs: Date.now() - startedMs,
    errors,
    dbLogError,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}
