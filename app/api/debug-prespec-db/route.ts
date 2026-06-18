import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { parseSupabaseUrl } from "@/lib/supabaseDebug";

/**
 * GET /api/debug-prespec-db
 *
 * 사전규격 *DB* 측 (Supabase / pre_spec_notices 테이블) 진단 전용 엔드포인트.
 *
 * 누군가 "테이블이 없어 상세를 조회할 수 없습니다" 메시지를 만났을 때 가장 먼저 두드릴 곳.
 *
 *  - 현재 앱이 보고 있는 Supabase project ref 를 *마스킹된 형태로* 표시.
 *  - public.pre_spec_notices 테이블이 실제로 존재하는지 확인.
 *  - row count 와 최근 3건 샘플(external_id / pre_spec_no / title 첫 30자) 을 반환.
 *  - 에러가 있으면 PostgREST/Postgres error code / message / details / hint 를 그대로 노출.
 *  - PGRST205 (schema cache miss) 인 경우 SQL 에서 `NOTIFY pgrst, 'reload schema';`
 *    를 한 번 실행하라는 안내를 hint 에 포함.
 *
 * 인증:
 *   - 의도적으로 비인증 (운영자가 브라우저로 바로 확인할 수 있어야 함).
 *   - 단, key 자체는 마스킹된 형태만 노출 + raw row 도 안전한 컬럼만 골라 표시.
 *
 * 응답 예 (성공):
 *   {
 *     ok: true,
 *     diagnosis: "OK",
 *     supabase: {
 *       projectRef: "szlhnsmf",            ← URL 의 host 첫 segment 마스킹
 *       url: "https://szlh****.supabase.co",
 *       serviceRoleKey: { present: true, masked: "sb_se***...***Y", length: 41 },
 *       anonKey:        { present: true, masked: "sb_pu***...***p", length: 46 }
 *     },
 *     table: "public.pre_spec_notices",
 *     exists: true,
 *     rowCount: 544,
 *     sample: [ { external_id, pre_spec_no, title } ... ]
 *   }
 *
 * 응답 예 (테이블 없음):
 *   {
 *     ok: false,
 *     diagnosis: "TABLE_MISSING",
 *     supabase: { ... },
 *     error: { code: "PGRST205", message: "...", hint: "..." },
 *     remediation: [
 *       "1) SQL Editor 에서 supabase/pre_spec_notices.sql 을 실행하세요.",
 *       "2) 그래도 안 되면 NOTIFY pgrst, 'reload schema'; 한 번 실행하세요.",
 *       "3) .env.local 의 NEXT_PUBLIC_SUPABASE_URL 이 실행한 프로젝트의 URL 과 같은지 확인."
 *     ]
 *   }
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SampleRow = {
  external_id: string;
  pre_spec_no: string | null;
  title: string;
  inserted_at: string | null;
  updated_at: string | null;
};

/** 키를 prefix … suffix 형태로 마스킹. */
function maskKey(value: string | undefined | null): {
  present: boolean;
  masked: string | null;
  length: number;
} {
  if (!value || value.trim().length === 0) {
    return { present: false, masked: null, length: 0 };
  }
  const v = value.trim();
  if (v.length <= 12) {
    return { present: true, masked: "****", length: v.length };
  }
  return {
    present: true,
    masked: `${v.slice(0, 6)}…${v.slice(-4)}`,
    length: v.length,
  };
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;

  const parsedUrl = parseSupabaseUrl(url);
  const supabaseInfo = {
    projectRef: parsedUrl.projectRef,
    url: parsedUrl.maskedUrl,
    /**
     * 환경변수 자체의 *상태* — 키 원문은 절대 노출하지 않는다.
     * masked 는 첫 6자 + 마지막 4자 형태로만.
     */
    serviceRoleKey: maskKey(serviceRoleKey),
    anonKey: maskKey(anonKey),
    /** project ref 만 봐도 어떤 supabase 인지 식별 가능 (운영자 본인 확인용). */
    note: "프로젝트 ref 만 노출 — Supabase Dashboard URL 의 /project/<ref> 와 같습니다.",
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        diagnosis: "ENV_MISSING",
        supabase: supabaseInfo,
        error: {
          code: "ENV_MISSING",
          message:
            "Supabase admin client 를 만들 수 없습니다 — NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 비어 있음.",
        },
        remediation: [
          "1) .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 모두 설정.",
          "2) 개발 서버를 재시작 (npm run dev).",
        ],
      },
      { status: 500 },
    );
  }

  /**
   * count + 샘플 3건 동시 조회.
   *  - count: "exact" 로 정확한 row 수.
   *  - 샘플: external_id / pre_spec_no / title (앞 60자) / inserted_at / updated_at.
   *  - service_role 사용 → RLS 우회. 권한 에러는 거의 안 뜸 (= 우리는 admin).
   */
  const sampleSelect =
    "external_id, pre_spec_no, title, inserted_at, updated_at";
  const { data, error, count } = await supabase
    .from("pre_spec_notices")
    .select(sampleSelect, { count: "exact" })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(3);

  if (error) {
    const code = error.code ?? "";
    const message = error.message ?? "";
    let diagnosis: "TABLE_MISSING" | "SCHEMA_CACHE_STALE" | "PERMISSION_DENIED" | "QUERY_ERROR";
    const remediation: string[] = [];
    if (code === "PGRST205") {
      diagnosis = "SCHEMA_CACHE_STALE";
      remediation.push(
        "PostgREST schema cache 가 새 테이블을 아직 모릅니다.",
        "Supabase SQL Editor 에서 다음을 한 번 실행하세요:  NOTIFY pgrst, 'reload schema';",
        "보통 1~2분 안에 자동으로도 반영되지만, 수동 NOTIFY 가 가장 빠릅니다.",
      );
    } else if (
      code === "42P01" ||
      /relation .* does not exist/i.test(message) ||
      /could not find the table/i.test(message)
    ) {
      diagnosis = "TABLE_MISSING";
      remediation.push(
        "Supabase SQL Editor 에서 supabase/pre_spec_notices.sql 을 실행하세요.",
        "실행 후 NOTIFY pgrst, 'reload schema'; 도 함께 실행하면 즉시 반영됩니다.",
        ".env.local 의 NEXT_PUBLIC_SUPABASE_URL project ref 가 SQL 을 실행한 프로젝트와 같은지 확인하세요.",
      );
    } else if (code === "42501" || /permission denied/i.test(message)) {
      diagnosis = "PERMISSION_DENIED";
      remediation.push(
        "service_role 키로도 SELECT 가 거부됨 — RLS 정책 또는 grants 가 잘못 걸려 있습니다.",
        "supabase/pre_spec_notices.sql 의 마지막 RLS 블록을 다시 실행하세요.",
      );
    } else {
      diagnosis = "QUERY_ERROR";
      remediation.push("error.code / error.message / error.hint 를 보고 원인을 좁혀 주세요.");
    }
    return NextResponse.json(
      {
        ok: false,
        diagnosis,
        supabase: supabaseInfo,
        table: "public.pre_spec_notices",
        exists: false,
        error: {
          code: error.code ?? null,
          message: error.message ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
        },
        remediation,
      },
      { status: 500 },
    );
  }

  const sample: SampleRow[] = Array.isArray(data) ? (data as SampleRow[]) : [];
  const rowCount = typeof count === "number" ? count : sample.length;

  // 테이블은 있는데 row 가 0 → "수집을 한 번도 안 돌렸음" 시나리오.
  if (rowCount === 0) {
    return NextResponse.json({
      ok: true,
      diagnosis: "EMPTY_TABLE",
      supabase: supabaseInfo,
      table: "public.pre_spec_notices",
      exists: true,
      rowCount: 0,
      sample: [],
      remediation: [
        "테이블은 정상 — 다만 사전규격 데이터가 아직 없습니다.",
        "운영: Vercel cron이 매일 08:30 KST(UTC 23:30)에 자동 수집합니다.",
        "관리자: 사전규격 화면 '지금 수집' 또는 /api/pre-spec/collect?days=7",
        "검증 SQL: supabase/verify_pre_spec.sql",
      ],
    });
  }

  return NextResponse.json({
    ok: true,
    diagnosis: "OK",
    supabase: supabaseInfo,
    table: "public.pre_spec_notices",
    exists: true,
    rowCount,
    sample: sample.map((r) => ({
      external_id: r.external_id,
      pre_spec_no: r.pre_spec_no,
      title:
        typeof r.title === "string" && r.title.length > 60
          ? `${r.title.slice(0, 60)}…`
          : r.title,
      inserted_at: r.inserted_at,
      updated_at: r.updated_at,
    })),
    detailUrlExample:
      sample[0]?.external_id != null
        ? `/pre-spec/${encodeURIComponent(sample[0].external_id)}`
        : null,
  });
}
