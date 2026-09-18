import { NextRequest, NextResponse } from "next/server";
import { fetchPreSpecAnnouncements, getInquiryRangeYyyymmdd, type PreSpecCategory } from "@/lib/preSpec/api";
import { normalizePreSpecItem } from "@/lib/preSpec/normalize";
import { upsertPreSpecNotices } from "@/lib/preSpec/persist";
import { resolvePreSpecServiceKey } from "@/lib/preSpec/serviceKey";
import { recordPreSpecSnapshot, summarizeCurrentPreSpecDbSnapshot } from "@/lib/preSpec/snapshot";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TOKEN = "pm-prespec-full-20260918-v2";
const CATS = new Set<PreSpecCategory>(["servc","thng","cnstwk","frgcpt"]);

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("token") !== TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode") ?? "collect";
  if (mode === "snapshot") {
    const fetchedCount = Math.max(0, Number(request.nextUrl.searchParams.get("fetched") ?? "0") || 0);
    const snapshot = await summarizeCurrentPreSpecDbSnapshot(fetchedCount);
    await recordPreSpecSnapshot({ source: "manual", counts: snapshot });
    return NextResponse.json({ ok: true, ...snapshot });
  }

  const cat = request.nextUrl.searchParams.get("cat") as PreSpecCategory | null;
  if (!cat || !CATS.has(cat)) {
    return NextResponse.json({ ok: false, error: "cat required" }, { status: 400 });
  }

  const key = resolvePreSpecServiceKey();
  if (!key.present) {
    return NextResponse.json({ ok: false, error: "pre-spec service key missing" }, { status: 500 });
  }

  const { inqryBgnDt, inqryEndDt } = getInquiryRangeYyyymmdd(7);
  const raw = await fetchPreSpecAnnouncements(key.key, {
    inqryBgnDt,
    inqryEndDt,
    categories: [cat],
    concurrency: 8,
  });

  const seen = new Set<string>();
  const items: PreSpecAnnouncement[] = [];
  const normalizeErrors: string[] = [];
  let i = 0;
  for (const rawItem of raw.items) {
    try {
      const meta = rawItem as { __sourceApi?: string; __sourceEndpoint?: string };
      const item = normalizePreSpecItem(rawItem, `pre-spec-${cat}-${i++}`, {
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

  const upsert = await upsertPreSpecNotices(items);
  return NextResponse.json({
    ok: raw.errors.length === 0 && normalizeErrors.length === 0 && upsert.errors.length === 0,
    category: cat,
    fetchedCount: raw.items.length,
    normalizedCount: items.length,
    totalByCategory: raw.totalsByCategory,
    pageCount: raw.pages.length,
    insertedCount: upsert.inserted,
    updatedCount: upsert.updated,
    errors: [...raw.errors, ...normalizeErrors, ...upsert.errors],
  });
}
