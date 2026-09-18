import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
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
