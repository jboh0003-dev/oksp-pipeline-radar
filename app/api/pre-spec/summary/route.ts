import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type SnapshotRow = {
  id: string;
  collected_at: string;
  source: string;
  fetched_count: number;
  related_count: number;
  contrabass_count: number;
  viola_count: number;
  related_keys: unknown;
};

function extractBearer(request: NextRequest): string | null {
  const raw = request.headers.get("authorization") ?? "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function kstDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function keys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin client unavailable" }, { status: 500 });
  }

  const token = extractBearer(request);
  if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { data: user, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("pre_spec_collection_snapshots")
    .select("id,collected_at,source,fetched_count,related_count,contrabass_count,viola_count,related_keys")
    .order("collected_at", { ascending: false })
    .limit(40);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const snapshots = (data ?? []) as SnapshotRow[];
  const latest = snapshots[0] ?? null;
  if (!latest) {
    return NextResponse.json({
      ok: true,
      latest: null,
      previous: null,
      newCount: 0,
      newKeys: [],
    });
  }

  const latestDay = kstDate(latest.collected_at);
  const previous =
    snapshots.find((row) => kstDate(row.collected_at) < latestDay) ??
    snapshots.find((row) => row.id !== latest.id) ??
    null;

  const latestKeys = keys(latest.related_keys);
  const previousSet = new Set(keys(previous?.related_keys));
  const newKeys = latestKeys.filter((key) => !previousSet.has(key));

  return NextResponse.json({
    ok: true,
    latest: {
      collectedAt: latest.collected_at,
      source: latest.source,
      fetchedCount: latest.fetched_count,
      relatedCount: latest.related_count,
      contrabassCount: latest.contrabass_count,
      violaCount: latest.viola_count,
    },
    previous: previous
      ? {
          collectedAt: previous.collected_at,
          source: previous.source,
          fetchedCount: previous.fetched_count,
          relatedCount: previous.related_count,
          contrabassCount: previous.contrabass_count,
          violaCount: previous.viola_count,
        }
      : null,
    newCount: newKeys.length,
    newKeys,
  });
}
