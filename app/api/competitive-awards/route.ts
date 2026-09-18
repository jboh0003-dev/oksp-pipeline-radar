import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type AwardRow = {
  customer?: string | null;
  project?: string | null;
  [key: string]: unknown;
};

function isActualAward(row: AwardRow): boolean {
  const customer = String(row.customer ?? "").trim();
  const project = String(row.project ?? "").replace(/\s+/g, " ").trim();

  // '각 수요기관'은 특정 고객의 실제 수주가 아니라 제3자단가·디지털서비스 등
  // 카탈로그/기본계약 등록 건으로 확인되어 수주실적 집계에서 제외한다.
  if (customer === "각 수요기관") return false;

  // 수요기관 값이 비어 있으면서 계약등록 성격이 명확한 레코드도 방어적으로 제외한다.
  if (!customer && /(제\s*3자\s*단가|3자단가|디지털서비스[_\s,]|상용SW\s*제3자단가)/i.test(project)) {
    return false;
  }

  return true;
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "데이터베이스 연결을 확인할 수 없습니다." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("competitive_awards")
    .select("id,external_key,competitor,winner_name,winner_business_no,award_date,opening_at,bid_no,bid_ord,project,customer,amount,rate,category,source_label,source_url,source_type,evidence,collected_at,updated_at")
    .eq("source_type", "g2b_award")
    .order("award_date", { ascending: false, nullsFirst: false })
    .order("bid_no", { ascending: false });

  if (error) {
    console.error("[/api/competitive-awards] query failed", error);
    return NextResponse.json({ ok: false, error: "나라장터 낙찰 데이터 조회에 실패했습니다." }, { status: 500 });
  }

  const rawRows = (data ?? []) as AwardRow[];
  const rows = rawRows.filter(isActualAward);

  const { data: productProjects, error: productProjectError } = await supabase
    .from("competitive_product_projects")
    .select("id,external_key,company,product,project_year,project_date,project,customer,sector,verification_level,source_label,source_url,public_source_label,public_source_url,bid_no,note,created_at,updated_at")
    .eq("sector", "public")
    .order("project_year", { ascending: false })
    .order("customer", { ascending: true });

  if (productProjectError) {
    console.error("[/api/competitive-awards] product project query failed", productProjectError);
  }

  return NextResponse.json({
    ok: true,
    rows,
    rawCount: rawRows.length,
    excludedCatalogRegistrationCount: rawRows.length - rows.length,
    productProjects: productProjectError ? [] : productProjects ?? [],
  });
}
