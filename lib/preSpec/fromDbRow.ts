import { normalizePreSpecItem } from "@/lib/preSpec/normalize";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

/** Supabase `public.pre_spec_notices` 테이블 row (목록/상세 공통). */
export type PreSpecDbRow = {
  external_id: string;
  pre_spec_no: string | null;
  notice_type?: string | null;
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
  inserted_at?: string | null;
  updated_at?: string | null;
};

function buildMinimalFromDbRow(row: PreSpecDbRow): PreSpecAnnouncement {
  const searchUrl =
    row.search_url ??
    (row.pre_spec_no
      ? `https://www.g2b.go.kr/link/PRCA001_04/single/?flag=cnrtSl&srch=0002&bfSpecRegNo=${encodeURIComponent(row.pre_spec_no)}&srchPreStdRgstNo=${encodeURIComponent(row.pre_spec_no)}`
      : "https://www.g2b.go.kr/link/PRCA001_04/single/?flag=cnrtSl&srch=0002");

  return {
    sourceType: "PRE_SPEC",
    announcementKey: row.pre_spec_no ?? row.external_id.replace(/^pre-spec:/, ""),
    preSpecRegNo: row.pre_spec_no ?? row.external_id.replace(/^pre-spec:/, ""),
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
    raw: row.raw_data ?? undefined,
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

/**
 * DB row → 화면용 PreSpecAnnouncement.
 * raw_data 가 있으면 normalizePreSpecItem 으로 최신 매칭/상태/제외 룰을 재계산한다.
 */
export function mapPreSpecDbRowToAnnouncement(row: PreSpecDbRow): PreSpecAnnouncement {
  if (row.raw_data && typeof row.raw_data === "object") {
    try {
      const item = normalizePreSpecItem(row.raw_data, row.external_id, {
        sourceApi: row.source_api ?? undefined,
        sourceEndpoint: row.source_endpoint ?? undefined,
      });
      return {
        ...item,
        linkedBidNo: row.linked_bid_no ?? item.linkedBidNo,
        detailUrl: row.detail_url_verified ? row.detail_url : item.detailUrl,
        detailUrlVerified: Boolean(row.detail_url_verified) || item.detailUrlVerified,
        searchUrl: row.search_url ?? item.searchUrl,
        attachmentUrl: row.attachment_url ?? item.attachmentUrl ?? item.specFileUrl,
        specFileUrl: row.attachment_url ?? row.spec_file_url ?? item.specFileUrl,
      };
    } catch {
      // normalize 실패 시 DB 컬럼 기반 최소 shape 로 폴백.
    }
  }
  return buildMinimalFromDbRow(row);
}
