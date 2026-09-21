import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type BidSnapshotCounts = {
  relatedCount: number;
  contrabassCount: number;
  violaCount: number;
  relatedKeys: string[];
};

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseProducts(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

export async function summarizeCurrentBidSnapshot(): Promise<BidSnapshotCounts> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { relatedCount: 0, contrabassCount: 0, violaCount: 0, relatedKeys: [] };
  }

  const today = kstToday();
  const rows: Array<{ external_id: string | null; products: unknown }> = [];
  const chunkSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("notices")
      .select("external_id,products")
      .eq("status", "open")
      .gte("due_date", today)
      .range(offset, offset + chunkSize - 1);

    if (error) {
      console.warn("[bid snapshot] current-state scan failed:", error.message);
      break;
    }

    const chunk = (data ?? []) as Array<{ external_id: string | null; products: unknown }>;
    rows.push(...chunk);
    if (chunk.length < chunkSize) break;
    offset += chunkSize;
  }

  const relatedKeys: string[] = [];
  let contrabassCount = 0;
  let violaCount = 0;

  for (const row of rows) {
    const products = parseProducts(row.products);
    const cb = products.some((p) =>
      ["CONTRABASS", "CONTRABASS Legato", "CONTRABASS SDS+"].includes(p),
    );
    const viola = products.includes("VIOLA");
    if (!cb && !viola) continue;
    if (cb) contrabassCount += 1;
    if (viola) violaCount += 1;
    if (row.external_id) relatedKeys.push(row.external_id);
  }

  return {
    relatedCount: relatedKeys.length,
    contrabassCount,
    violaCount,
    relatedKeys: Array.from(new Set(relatedKeys)).sort(),
  };
}

export async function recordBidSnapshot(source = "auto"): Promise<BidSnapshotCounts> {
  const supabase = getSupabaseAdmin();
  const counts = await summarizeCurrentBidSnapshot();
  if (!supabase) return counts;

  const { error } = await supabase.from("bid_collection_snapshots").insert({
    source,
    related_count: counts.relatedCount,
    contrabass_count: counts.contrabassCount,
    viola_count: counts.violaCount,
    related_keys: counts.relatedKeys,
  } as never);

  if (error) {
    console.warn("[bid snapshot] insert failed:", error.message);
  }
  return counts;
}
