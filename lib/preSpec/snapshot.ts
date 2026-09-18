import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePreSpecItem } from "@/lib/preSpec/normalize";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

export type PreSpecSnapshotCounts = {
  fetchedCount: number;
  relatedCount: number;
  contrabassCount: number;
  violaCount: number;
  relatedKeys: string[];
};

function isActive(item: PreSpecAnnouncement): boolean {
  return item.status !== "마감";
}

export function summarizePreSpecSnapshot(
  items: PreSpecAnnouncement[],
  fetchedCount: number,
): PreSpecSnapshotCounts {
  const related = items.filter(
    (item) =>
      isActive(item) &&
      (item.products.includes("CONTRABASS") || item.products.includes("VIOLA")),
  );

  return {
    fetchedCount,
    relatedCount: related.length,
    contrabassCount: related.filter((item) => item.products.includes("CONTRABASS")).length,
    violaCount: related.filter((item) => item.products.includes("VIOLA")).length,
    relatedKeys: Array.from(new Set(related.map((item) => item.announcementKey))).sort(),
  };
}

export async function recordPreSpecSnapshot(input: {
  source: "auto" | "manual";
  counts: PreSpecSnapshotCounts;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from("pre_spec_collection_snapshots").insert({
    source: input.source,
    fetched_count: input.counts.fetchedCount,
    related_count: input.counts.relatedCount,
    contrabass_count: input.counts.contrabassCount,
    viola_count: input.counts.violaCount,
    related_keys: input.counts.relatedKeys,
  } as never);

  if (error) {
    console.warn("[pre-spec snapshot] insert failed:", error.message);
  }
}


export async function summarizeCurrentPreSpecDbSnapshot(
  fetchedCount: number,
): Promise<PreSpecSnapshotCounts> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      fetchedCount,
      relatedCount: 0,
      contrabassCount: 0,
      violaCount: 0,
      relatedKeys: [],
    };
  }

  const items: PreSpecAnnouncement[] = [];
  const chunkSize = 1000;
  let offset = 0;
  let fallbackIndex = 0;

  while (true) {
    const { data, error } = await supabase
      .from("pre_spec_notices")
      .select("external_id,raw_data,source_api,source_endpoint")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + chunkSize - 1);

    if (error) {
      console.warn("[pre-spec snapshot] DB scan failed:", error.message);
      break;
    }

    const rows = (data ?? []) as Array<{
      external_id?: string | null;
      raw_data?: Record<string, unknown> | null;
      source_api?: string | null;
      source_endpoint?: string | null;
    }>;

    for (const row of rows) {
      if (!row.raw_data || typeof row.raw_data !== "object") continue;
      try {
        items.push(
          normalizePreSpecItem(
            row.raw_data,
            row.external_id ?? `pre-spec-db-${fallbackIndex++}`,
            {
              sourceApi: row.source_api ?? undefined,
              sourceEndpoint: row.source_endpoint ?? undefined,
            },
          ),
        );
      } catch {
        // 단건 포맷 오류는 전체 snapshot 계산을 막지 않는다.
      }
    }

    if (rows.length < chunkSize) break;
    offset += chunkSize;
  }

  return summarizePreSpecSnapshot(items, fetchedCount);
}
