import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminFailResponse } from "@/lib/apiAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const VALID_PRODUCTS = new Set(["CONTRABASS", "VIOLA"]);

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin client unavailable" }, { status: 500 });

  const { data, error } = await supabase
    .from("keyword_rules_runtime")
    .select("id,rule_type,product,keyword,enabled,created_at,updated_at")
    .order("rule_type")
    .order("product")
    .order("keyword");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rules: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin client unavailable" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const ruleType = body.ruleType === "exclude" ? "exclude" : body.ruleType === "product" ? "product" : null;
  const keyword = String(body.keyword ?? "").trim();
  const product = ruleType === "product" ? String(body.product ?? "").trim() : "";
  if (!ruleType || !keyword) return NextResponse.json({ ok: false, error: "규칙 유형과 키워드를 입력하세요." }, { status: 400 });
  if (ruleType === "product" && !VALID_PRODUCTS.has(product)) {
    return NextResponse.json({ ok: false, error: "제품은 CONTRABASS 또는 VIOLA만 가능합니다." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("keyword_rules_runtime")
    .upsert({ rule_type: ruleType, product, keyword, enabled: true, updated_at: new Date().toISOString() }, { onConflict: "rule_type,product,keyword" })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rule: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin client unavailable" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id || typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "id/enabled 확인 필요" }, { status: 400 });
  }
  const { error } = await supabase
    .from("keyword_rules_runtime")
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin client unavailable" }, { status: 500 });

  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "id 확인 필요" }, { status: 400 });
  const { error } = await supabase.from("keyword_rules_runtime").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
