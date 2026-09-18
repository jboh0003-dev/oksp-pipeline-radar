import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminFailResponse } from "@/lib/apiAuth";
import { getSupabaseAdmin, getMissingSyncEnvVars } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin client unavailable" }, { status: 500 });

  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [runsResp, noticesResp, profilesResp, keywordResp] = await Promise.all([
    supabase
      .from("collection_runs")
      .select("id,source,mode,started_at,finished_at,ok,fetched_count,matched_count,saved_count,inserted_count,updated_count,message,errors")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(12),
    supabase
      .from("notices")
      .select("id,products,due_date,status,source_type")
      .eq("status", "open"),
    supabase.from("profiles").select("id,role"),
    supabase
      .from("keyword_rules_runtime")
      .select("id,rule_type,product,enabled")
      .eq("enabled", true),
  ]);

  const notices = (noticesResp.data ?? []) as Array<{
    id: string;
    products?: string[] | null;
    due_date?: string | null;
    source_type?: string | null;
  }>;
  const active = notices.filter((row) => !row.due_date || row.due_date >= nowKst);
  const keywordRows = (keywordResp.data ?? []) as Array<{ rule_type: string; product: string; enabled: boolean }>;

  return NextResponse.json({
    ok: true,
    environment: {
      missing: getMissingSyncEnvVars(),
      g2bConfigured: Boolean(process.env.G2B_SERVICE_KEY?.trim()),
      cronConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      supabaseAdminConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    },
    notices: {
      active: active.length,
      contrabass: active.filter((row) => row.products?.includes("CONTRABASS")).length,
      viola: active.filter((row) => row.products?.includes("VIOLA")).length,
    },
    users: {
      total: profilesResp.data?.length ?? 0,
      admins: (profilesResp.data ?? []).filter((row: any) => row.role === "admin").length,
    },
    keywords: {
      enabled: keywordRows.length,
      contrabass: keywordRows.filter((row) => row.rule_type === "product" && row.product === "CONTRABASS").length,
      viola: keywordRows.filter((row) => row.rule_type === "product" && row.product === "VIOLA").length,
      exclude: keywordRows.filter((row) => row.rule_type === "exclude").length,
    },
    recentRuns: runsResp.data ?? [],
  });
}
