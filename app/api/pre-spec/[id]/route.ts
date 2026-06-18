import { NextResponse } from "next/server";
import { normalizePreSpecItem } from "@/lib/preSpec/normalize";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

/**
 * GET /api/pre-spec/[id]
 *
 * 사전규격 *내부 상세 페이지* 가 사용한다.
 *
 *  - id = external_id (= 사전규격등록번호 / bfSpecRgstNo / preSpecRegNo)
 *  - DB 의 public.pre_spec_notices 에서 row 1건을 조회한다.
 *  - raw_data jsonb 가 있으면 그 위에 normalizePreSpecItem 을 재실행해
 *    products / matchedKeywords / status / recommendation 등 매칭 결과를 항상 *최신 매칭 룰* 로 반환.
 *  - raw_data 가 없으면 DB 컬럼만으로 최소 형태를 만들어 반환한다 (legacy row 호환).
 *
 * 응답:
 *   { ok: true,  item: PreSpecAnnouncement, source: 'db' | 'db-no-raw' }
 *   { ok: false, error: <message> }   (404 / 500)
 *
 * 정책 (사용자 요청):
 *   - 검증되지 않은 검색/목록 URL 은 detailUrl 에 절대 들어가지 않는다 (resolvePreSpecDetailUrl 가 처리).
 *   - 매칭 룰이 바뀌어도 DB 재수집 없이 최신 매칭 결과가 반영되게 raw_data 위에 normalize 재실행.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PreSpecRowSelected = {
  external_id: string;
  pre_spec_no: string | null;
  title: string;
  business_name: string | null;
  org_name: string | null;
  demand_org_name: string | null;
  bsns_div_label: string | null;
  budget: number | null;
  open_date: string | null;
  opinion_deadline: string | null;
  linked_bid_no: string | null;
  detail_url: string | null;
  search_url: string | null;
  attachment_url: string | null;
  spec_file_url: string | null;
  detail_url_method: string | null;
  detail_url_verified: boolean | null;
  detail_url_checked_at: string | null;
  original_url: string | null;
  source_api: string | null;
  source_endpoint: string | null;
  raw_data: Record<string, unknown> | null;
  inserted_at: string | null;
  updated_at: string | null;
};

/**
 * raw_data 가 비어 있을 때, DB 컬럼만으로 최소한의 PreSpecAnnouncement shape 을 만든다.
 *  - 매칭(products / keywords) 은 빈 배열로 둔다 (raw 가 없으니 정확한 매칭 불가능).
 *  - 화면은 "raw_data 누락 — 매칭 결과 재계산 안 됨" 안내를 띄울 수 있게 source='db-no-raw' 로 응답.
 */
function buildMinimalAnnouncement(row: PreSpecRowSelected): PreSpecAnnouncement {
  // 검색 URL 은 항상 채워지도록 — DB search_url 이 비어 있으면 즉석 생성.
  const searchUrl =
    row.search_url ??
    (row.pre_spec_no
      ? `https://www.g2b.go.kr/link/PRCA001_04/single/?flag=cnrtSl&srch=0002&bfSpecRegNo=${encodeURIComponent(row.pre_spec_no)}&srchPreStdRgstNo=${encodeURIComponent(row.pre_spec_no)}`
      : "https://www.g2b.go.kr/link/PRCA001_04/single/?flag=cnrtSl&srch=0002");
  return {
    sourceType: "PRE_SPEC",
    announcementKey: row.external_id,
    preSpecRegNo: row.pre_spec_no ?? row.external_id,
    bsnsDivLabel: row.bsns_div_label ?? undefined,
    title: row.title,
    businessName: row.business_name ?? undefined,
    orgName: row.org_name ?? "(기관 미상)",
    demandOrgName: row.demand_org_name ?? undefined,
    budget: row.budget ?? 0,
    openDate: row.open_date ?? undefined,
    opinionDeadline: row.opinion_deadline ?? undefined,
    fileName: undefined,
    fileUrl: row.attachment_url ?? row.spec_file_url ?? undefined,
    specFileUrl: row.attachment_url ?? row.spec_file_url ?? undefined,
    attachmentUrl: row.attachment_url ?? row.spec_file_url ?? undefined,
    detailUrl: row.detail_url_verified ? row.detail_url : null,
    searchUrl,
    detailUrlMethod:
      (row.detail_url_method as PreSpecAnnouncement["detailUrlMethod"]) ??
      (row.pre_spec_no ? "search-fallback" : "unsupported"),
    detailUrlVerified: Boolean(row.detail_url_verified),
    detailUrlReason: undefined,
    originalUrl: row.original_url ?? undefined,
    raw: undefined,
    products: [],
    primaryProduct: null,
    productScores: {},
    matchedKeywords: [],
    matchReason: undefined,
    department: "미매칭",
    namedType: "-",
    region: undefined,
    status: "확인필요",
    recommendation: "참고",
    isNew: false,
    newAt: null,
    feedbackCount: 0,
    customer: null,
    linkedBidNo: row.linked_bid_no ?? undefined,
    linkedBidTitle: undefined,
    linkedStatus: row.linked_bid_no ? "입찰공고등록" : undefined,
    attachments: [],
    hasRfp: false,
    hasSpecDoc: Boolean(row.attachment_url ?? row.spec_file_url),
    hasTaskDoc: false,
    sourceApi: row.source_api ?? undefined,
    sourceEndpoint: row.source_endpoint ?? undefined,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const externalId = (id ?? "").trim();
  if (!externalId) {
    return NextResponse.json(
      { ok: false, error: "사전규격 식별자가 비어 있습니다." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Supabase admin client 환경변수가 설정되어 있지 않아 DB 조회가 불가능합니다. " +
          "(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인)",
      },
      { status: 500 },
    );
  }

  // external_id 매칭 후보 — 사전규격은 'pre-spec:' prefix 정책을 적용했지만,
  // 1) 마이그레이션 이전 legacy row (= prefix 없음)
  // 2) 화면이 preSpecRegNo 만으로 라우팅한 경우 (= URL 의 id 가 prefix 없음)
  // 3) 신규 row (= 'pre-spec:<regNo>' prefix 있음)
  // 위 세 가지를 모두 한 번에 조회한다.
  const prefixed = externalId.startsWith("pre-spec:")
    ? externalId
    : `pre-spec:${externalId}`;
  const bare = externalId.startsWith("pre-spec:")
    ? externalId.slice("pre-spec:".length)
    : externalId;

  const { data, error } = await supabase
    .from("pre_spec_notices")
    .select(
      "external_id, pre_spec_no, title, business_name, org_name, demand_org_name, bsns_div_label, budget, open_date, opinion_deadline, linked_bid_no, detail_url, search_url, attachment_url, spec_file_url, detail_url_method, detail_url_verified, detail_url_checked_at, original_url, source_api, source_endpoint, raw_data, inserted_at, updated_at",
    )
    .or(
      `external_id.eq.${prefixed},external_id.eq.${bare},pre_spec_no.eq.${bare}`,
    )
    .limit(1)
    .maybeSingle<PreSpecRowSelected>();

  if (error) {
    // Supabase / Postgres 에러를 *원인별로* 구분 — UI 에 정확한 메시지를 노출하기 위해.
    //   PGRST205 / 42P01 = 테이블 없음 / 스키마 캐시 미반영
    //   42501          = RLS / GRANT 권한 거부
    //   그 외          = 일반 조회 에러
    const code = error.code ?? "";
    const msg = error.message ?? "";
    if (code === "PGRST205") {
      return NextResponse.json(
        {
          ok: false,
          diagnosis: "SCHEMA_CACHE_STALE",
          error:
            "PostgREST schema cache 가 새 테이블을 아직 인식하지 못합니다. Supabase SQL Editor 에서 NOTIFY pgrst, 'reload schema'; 를 한 번 실행해 주세요.",
          dbError: { code, message: msg, hint: error.hint ?? null },
        },
        { status: 500 },
      );
    }
    if (code === "42P01" || /relation .* does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          diagnosis: "TABLE_MISSING",
          error:
            "pre_spec_notices 테이블이 존재하지 않습니다. supabase/pre_spec_notices.sql 을 실행해 주세요. (/api/debug-prespec-db 로 현재 Supabase project 와 테이블 상태를 확인할 수 있습니다.)",
          dbError: { code, message: msg, hint: error.hint ?? null },
        },
        { status: 500 },
      );
    }
    if (code === "42501" || /permission denied/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          diagnosis: "PERMISSION_DENIED",
          error:
            "Supabase 가 SELECT 를 거부했습니다 (권한 없음). RLS 정책 또는 grants 를 확인해 주세요.",
          dbError: { code, message: msg, hint: error.hint ?? null },
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        diagnosis: "QUERY_ERROR",
        error: `DB 조회 실패: ${msg}`,
        dbError: { code, message: msg, hint: error.hint ?? null, details: error.details ?? null },
      },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        ok: false,
        diagnosis: "NOT_FOUND",
        error: `'${externalId}' 에 해당하는 사전규격 데이터가 DB 에 없습니다. 수집을 한 번 더 실행하거나, 사전규격 목록 화면에서 들어와 주세요. (목록 화면이라면 localStorage 캐시로 즉시 표시됩니다.)`,
        notFound: true,
        externalId,
      },
      { status: 404 },
    );
  }

  // raw_data 가 있으면 normalizePreSpecItem 으로 매칭/상태/추천을 *최신 룰* 로 재계산.
  // 없으면 DB 컬럼만으로 최소 shape 반환.
  if (data.raw_data && typeof data.raw_data === "object") {
    try {
      const item = normalizePreSpecItem(
        data.raw_data as Record<string, unknown>,
        data.external_id,
        {
          sourceApi: data.source_api ?? undefined,
          sourceEndpoint: data.source_endpoint ?? undefined,
        },
      );
      // DB 메타데이터 일부 — DB 가 더 신뢰할 수 있는 값이므로 normalize 결과 위에 덮어쓴다.
      // (예: linked_bid_no 는 DB 에서 사람이 직접 보정했을 수 있음.)
      const merged: PreSpecAnnouncement = {
        ...item,
        linkedBidNo: data.linked_bid_no ?? item.linkedBidNo,
        // detail_url 은 verified=true 일 때만 채워지도록 normalize 가 보장하지만,
        // DB 에 사람이 직접 등록한 *검증된* URL 이 있을 수도 있으니 DB 우선.
        detailUrl: data.detail_url_verified ? data.detail_url : item.detailUrl,
        detailUrlVerified: Boolean(data.detail_url_verified) || item.detailUrlVerified,
      };
      return NextResponse.json({
        ok: true,
        item: merged,
        source: "db",
        meta: {
          insertedAt: data.inserted_at,
          updatedAt: data.updated_at,
        },
      });
    } catch (err) {
      // 정규화 실패는 minimal fallback 으로 진행.
      const item = buildMinimalAnnouncement(data);
      return NextResponse.json({
        ok: true,
        item,
        source: "db-normalize-failed",
        normalizeError: err instanceof Error ? err.message : String(err),
        meta: {
          insertedAt: data.inserted_at,
          updatedAt: data.updated_at,
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    item: buildMinimalAnnouncement(data),
    source: "db-no-raw",
    meta: {
      insertedAt: data.inserted_at,
      updatedAt: data.updated_at,
    },
  });
}
