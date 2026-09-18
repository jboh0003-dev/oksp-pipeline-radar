import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_PRE_SPEC_CATEGORIES, fetchPreSpecAnnouncements, getInquiryRangeYyyymmdd } from "@/lib/preSpec/api";
import { normalizePreSpecItem } from "@/lib/preSpec/normalize";
import { upsertPreSpecNotices } from "@/lib/preSpec/persist";
import { resolvePreSpecServiceKey } from "@/lib/preSpec/serviceKey";
import { recordPreSpecSnapshot, summarizePreSpecSnapshot } from "@/lib/preSpec/snapshot";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TOKEN = "pm-prespec-full-20260918-v1";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("token") !== TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const key = resolvePreSpecServiceKey();
  if (!key.present) {
    return NextResponse.json({ ok: false, error: "pre-spec service key missing" }, { status: 500 });
  }

  const { inqryBgnDt, inqryEndDt } = getInquiryRangeYyyymmdd(30);
  const raw = await fetchPreSpecAnnouncements(key.key, {
    inqryBgnDt,
    inqryEndDt,
    categories: DEFAULT_PRE_SPEC_CATEGORIES,
    concurrency: 8,
  });

  const seen = new Set<string>();
  const items: PreSpecAnnouncement[] = [];
  const normalizeErrors: string[] = [];
  let i = 0;
  for (const rawItem of raw.items) {
    try {
      const meta = rawItem as { __sourceApi?: string; __sourceEndpoint?: string };
      const item = normalizePreSpecItem(rawItem, `pre-spec-${i++}`, {
        sourceApi: meta.__sourceApi,
        sourceEndpoint: meta.__sourceEndpoint,
      });
      if (!item.announcementKey || seen.has(item.announcementKey)) continue;
      seen.add(item.announcementKey);
      items.push(item);
    } catch (error) {
      normalizeErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const snapshot = summarizePreSpecSnapshot(items, raw.items.length);
  const upsert = await upsertPreSpecNotices(items);
  await recordPreSpecSnapshot({ source: "manual", counts: snapshot });

  return NextResponse.json({
    ok: raw.errors.length === 0 && normalizeErrors.length === 0 && upsert.errors.length === 0,
    fetchedCount: raw.items.length,
    normalizedCount: items.length,
    relatedCount: snapshot.relatedCount,
    contrabassCount: snapshot.contrabassCount,
    violaCount: snapshot.violaCount,
    totalByCategory: raw.totalsByCategory,
    pageCount: raw.pages.length,
    insertedCount: upsert.inserted,
    updatedCount: upsert.updated,
    errors: [...raw.errors, ...normalizeErrors, ...upsert.errors],
  });
}
