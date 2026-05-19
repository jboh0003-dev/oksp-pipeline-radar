import { createClient } from "@supabase/supabase-js";
import type { NoticeUpsertRow } from "@/lib/g2b/mapNotice";

export type SavedNoticeSummary = {
  external_id: string;
  title: string;
  agency: string;
  match_score: number;
  products: string[];
  keywords: string[];
};

export function getMissingSyncEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.G2B_SERVICE_KEY?.trim()) {
    missing.push("G2B_SERVICE_KEY");
  }
  if (!process.env.G2B_API_BASE_URL?.trim()) {
    missing.push("G2B_API_BASE_URL");
  }
  return missing;
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function upsertNotices(rows: NoticeUpsertRow[]): Promise<SavedNoticeSummary[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase admin client를 생성하지 못했습니다.");
  }

  const { data, error } = await supabase
    .from("notices")
    .upsert(rows as never[], { onConflict: "external_id" })
    .select("external_id, title, agency, match_score, products, keywords");

  if (error) {
    throw error;
  }

  return (data ?? []) as SavedNoticeSummary[];
}
