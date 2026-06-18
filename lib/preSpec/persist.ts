/**
 * 사전규격공고 DB upsert 헬퍼.
 *
 *  - 대상 테이블: public.pre_spec_notices  (supabase/pre_spec_notices.sql)
 *  - upsert key: external_id (= "pre-spec:<preSpecRegNo>", 없으면 "pre-spec:<announcementKey>").
 *
 * external_id 포맷 (사용자 요청, 사전규격등록번호 기반 충돌 방지):
 *  - 항상 "pre-spec:" 접두어를 붙인다 → 다른 source 와의 우발적 충돌을 원천 차단.
 *  - preSpecRegNo (= bfSpecRgstNo / preSpecRegNo / preStdRegNo / publicPreSpecNo) 우선.
 *  - regNo 가 없을 때만 announcementKey (= name|org|due) 로 폴백.
 *  - 마이그레이션: supabase/pre_spec_notices.sql 의 UPDATE 절이 기존 row 도 prefix 추가.
 *  - /api/pre-spec/[id] 조회 시 prefix 유무 양쪽 모두 매칭 가능하게 해둠.
 *
 * 정책:
 *  - external_id 가 같으면 UPDATE.
 *  - detail_url / search_url / detail_url_method / detail_url_verified / detail_url_checked_at /
 *    attachment_url 은 *항상* 새 값으로 덮어쓴다.
 *    → 검증되지 않은 legacy fallback URL 이 detail_url 컬럼에 남아 있을 수 있어
 *      "기존 값 보존" 정책을 쓰면 사용자에게 잘못된 상세 링크가 계속 노출된다.
 *      이 케이스를 차단하기 위해 *항상 덮어쓰기*. detail_url_verified=false 케이스는 NULL 로 정리됨.
 *  - original_url 은 raw API URL 이라 의미 변화가 없어, 기존이 NULL/빈 값일 때만 새 값으로 채운다.
 *  - 그 외 컬럼(제목/기관명/마감일 등) 은 항상 새 값으로 덮어쓴다 (G2B 가 갱신할 수 있음).
 *  - notice_type 은 항상 'pre_spec'.
 *
 * 반환:
 *  - inserted / updated / skipped / errors 카운트 + 단건 에러 메시지.
 *  - 테이블이 없거나 RLS 차단 등으로 모든 row 가 실패해도 throw 하지 않고 카운트로만 노출.
 */

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

export type PreSpecUpsertSummary = {
  attempted: number;
  inserted: number;
  updated: number;
  /** original_url/detail_url 만 채워진 update (skipped 가 아니라 카운트). */
  urlPatched: number;
  skipped: number;
  errors: string[];
  /** 테이블 자체가 없으면 true — 호출부에서 SQL 실행 안내를 띄울 수 있게. */
  tableMissing: boolean;
};

type PreSpecRow = {
  external_id: string;
  pre_spec_no: string | null;
  notice_type: "pre_spec";
  title: string;
  business_name: string | null;
  org_name: string | null;
  demand_org_name: string | null;
  bsns_div_label: string | null;
  budget: number | null;
  open_date: string | null;
  opinion_deadline: string | null;
  linked_bid_no: string | null;
  /** 검증된 상세 URL — verified=true 일 때만 채워진다. 그 외엔 null. */
  detail_url: string | null;
  /** 항상 채워지는 검색 URL — UI 의 "나라장터 검색" 버튼이 사용. */
  search_url: string | null;
  /** 'verified-detail' | 'search-fallback' | 'unsupported'. */
  detail_url_method: string | null;
  /** detail_url 이 검증된 상세 페이지로 직접 진입하는지 여부. */
  detail_url_verified: boolean;
  /** 마지막으로 detail_url 검증을 시도한 시각. */
  detail_url_checked_at: string | null;
  /** raw 로 받은 원본 URL (DB legacy 컬럼) — search URL 과 혼동하지 않도록 분리 보관. */
  original_url: string | null;
  /** 규격서 첨부 URL — UI 의 "규격서" 버튼이 사용. */
  attachment_url: string | null;
  /** legacy alias — attachment_url 과 동일 값을 유지 (구 컬럼 호환). */
  spec_file_url: string | null;
  source_api: string | null;
  source_endpoint: string | null;
  raw_data: Record<string, unknown> | null;
};

/**
 * 사전규격 row 의 external_id 를 빌드한다.
 *
 * 형식: `pre-spec:<key>` 여기서 key = preSpecRegNo > announcementKey 우선순위.
 *
 * 절대 외부에서 직접 문자열 합성하지 말고 이 함수만 사용해라 — 형식이 바뀌면 한 곳만 고친다.
 */
export function buildPreSpecExternalId(item: PreSpecAnnouncement): string {
  const reg = item.preSpecRegNo?.trim();
  const fallback = item.announcementKey?.trim();
  const key = reg || fallback || "";
  if (!key) {
    // 이 케이스는 normalize 단계에서 announcementKey 가 항상 채워져서 사실상 안 옴.
    // 그래도 방어적으로 stable 한 형태를 반환 — 같은 빈 input 은 같은 external_id.
    return "pre-spec:__empty__";
  }
  return `pre-spec:${key}`;
}

function toRow(item: PreSpecAnnouncement): PreSpecRow {
  const externalId = buildPreSpecExternalId(item);
  const attachment = item.attachmentUrl ?? item.specFileUrl ?? null;
  const detailUrl = item.detailUrlVerified ? (item.detailUrl ?? null) : null;
  return {
    external_id: externalId,
    pre_spec_no: item.preSpecRegNo ?? null,
    notice_type: "pre_spec",
    title: item.title,
    business_name: item.businessName ?? null,
    org_name: item.orgName ?? null,
    demand_org_name: item.demandOrgName ?? null,
    bsns_div_label: item.bsnsDivLabel ?? null,
    budget: item.budget && item.budget > 0 ? item.budget : null,
    open_date: item.openDate ?? null,
    opinion_deadline: item.opinionDeadline ?? null,
    linked_bid_no: item.linkedBidNo ?? null,
    detail_url: detailUrl,
    search_url: item.searchUrl ?? null,
    detail_url_method: item.detailUrlMethod ?? null,
    detail_url_verified: Boolean(item.detailUrlVerified),
    detail_url_checked_at: new Date().toISOString(),
    original_url: item.originalUrl ?? null,
    attachment_url: attachment,
    spec_file_url: attachment,
    source_api: item.sourceApi ?? null,
    source_endpoint: item.sourceEndpoint ?? null,
    raw_data: (item.raw as Record<string, unknown> | undefined) ?? null,
  };
}

/**
 * URL 컬럼 병합 정책.
 *
 *  - detail_url      : *항상 incoming 값으로 덮어쓴다*. verified=false 인 항목은 NULL 이 되어
 *                      과거에 잘못 들어간 검색 fallback URL 이 자동으로 제거된다.
 *  - original_url    : raw API URL — 기존이 비어 있을 때만 채운다 (의미 변화 없음).
 *
 * detail_url 가 *NULL → 비-NULL* 또는 *비-NULL → NULL* 로 변경되면 patched=true.
 */
function mergeUrlPolicy(
  existing: { detail_url: string | null; original_url: string | null },
  incoming: PreSpecRow,
): { detail_url: string | null; original_url: string | null; patched: boolean } {
  let patched = false;

  // detail_url 은 항상 덮어쓴다 (잘못된 legacy fallback 제거 목적).
  const detail = incoming.detail_url;
  if ((existing.detail_url ?? null) !== (detail ?? null)) {
    patched = true;
  }

  // original_url 은 fill-on-null 정책 유지 (raw API URL 이라 보존).
  let original = existing.original_url;
  if ((!original || original.trim().length === 0) && incoming.original_url) {
    original = incoming.original_url;
    patched = true;
  }

  return { detail_url: detail, original_url: original, patched };
}

/**
 * 사전규격 항목 배열을 pre_spec_notices 에 upsert.
 *
 *  1) external_id 별로 기존 row 를 한 번에 SELECT (in clause).
 *  2) 기존 row 가 없으면 INSERT, 있으면 UPDATE (URL 정책 반영).
 *  3) 결과를 카운트 + errors 로 반환.
 */
export async function upsertPreSpecNotices(
  items: PreSpecAnnouncement[],
): Promise<PreSpecUpsertSummary> {
  const summary: PreSpecUpsertSummary = {
    attempted: items.length,
    inserted: 0,
    updated: 0,
    urlPatched: 0,
    skipped: 0,
    errors: [],
    tableMissing: false,
  };

  if (items.length === 0) return summary;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    summary.errors.push(
      "Supabase admin client 환경변수 누락 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    );
    summary.skipped = items.length;
    return summary;
  }

  const rows = items.map(toRow);

  // dedup by external_id (마지막 항목 우선) — G2B 가 동일 등록번호를 한 응답에 두 번 줄 가능성 차단.
  const dedup = new Map<string, PreSpecRow>();
  for (const r of rows) dedup.set(r.external_id, r);
  const uniqueRows = Array.from(dedup.values());
  summary.attempted = uniqueRows.length;

  // 1) 기존 row 일괄 조회.
  //    PostgREST .in() 은 GET URL 의 query 로 직렬화되므로 ids 가 수백 개를 넘으면
  //    URL 길이 한계(undici 기본 ~16KB) 를 넘어 `TypeError: fetch failed` 발생.
  //    → 200건 단위 chunk 로 잘라서 SELECT.
  const ids = uniqueRows.map((r) => r.external_id);
  const SELECT_CHUNK = 200;
  const existingMap = new Map<
    string,
    { detail_url: string | null; original_url: string | null }
  >();
  for (let i = 0; i < ids.length; i += SELECT_CHUNK) {
    const idsChunk = ids.slice(i, i + SELECT_CHUNK);
    const { data: existing, error: selectErr } = await supabase
      .from("pre_spec_notices")
      .select("external_id, detail_url, original_url")
      .in("external_id", idsChunk);

    if (selectErr) {
      // 테이블이 없으면 PGRST205 / 42P01 — 사용자가 SQL 마이그레이션을 안 돌린 케이스.
      const code = selectErr.code ?? "";
      const msg = selectErr.message ?? "";
      if (code === "42P01" || /relation .* does not exist/i.test(msg) || code === "PGRST205") {
        summary.tableMissing = true;
        summary.errors.push(
          "pre_spec_notices 테이블이 존재하지 않습니다. supabase/pre_spec_notices.sql 을 한 번 실행해 주세요.",
        );
        summary.skipped = uniqueRows.length;
        return summary;
      }
      summary.errors.push(
        `pre_spec_notices SELECT 실패 (chunk ${i / SELECT_CHUNK + 1}): ${msg}`,
      );
      summary.skipped += idsChunk.length;
      // 한 chunk 가 실패해도 나머지는 계속 시도 (네트워크 일시 장애 대응).
      continue;
    }
    for (const row of (existing ?? []) as Array<{
      external_id: string;
      detail_url: string | null;
      original_url: string | null;
    }>) {
      existingMap.set(row.external_id, {
        detail_url: row.detail_url,
        original_url: row.original_url,
      });
    }
  }

  // 2) 신규 / 기존 분리 후 한 번씩 bulk 처리.
  const toInsert: PreSpecRow[] = [];
  const toUpdate: Array<PreSpecRow & { patched: boolean }> = [];
  for (const row of uniqueRows) {
    const found = existingMap.get(row.external_id);
    if (!found) {
      toInsert.push(row);
    } else {
      const merged = mergeUrlPolicy(found, row);
      toUpdate.push({
        ...row,
        detail_url: merged.detail_url,
        original_url: merged.original_url,
        patched: merged.patched,
      });
    }
  }

  // INSERT 도 200건 단위로 chunk — 큰 body 로 인한 timeout / payload-too-large 회피.
  if (toInsert.length > 0) {
    const INSERT_CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + INSERT_CHUNK);
      const { error: insertErr } = await supabase
        .from("pre_spec_notices")
        .insert(chunk as never);
      if (insertErr) {
        summary.errors.push(
          `pre_spec_notices INSERT 실패 (chunk ${i / INSERT_CHUNK + 1}): ${insertErr.message}`,
        );
        summary.skipped += chunk.length;
      } else {
        summary.inserted += chunk.length;
      }
    }
  }

  // UPDATE 는 row 별로 분기 (URL 정책 적용 결과가 row 마다 다름).
  // upsert(onConflict: external_id) 한 번으로 처리해도 되지만, urlPatched 카운트를 분리하기 위해
  // 명시적으로 update 를 돌린다. 환경에 따라 row 가 많지 않으니 (보통 수십 건) 부담 없음.
  //
  // ★ 주의: `patched` 와 `external_id` 는 *DB 컬럼이 아니므로* update payload 에서 반드시 제거해야 한다.
  //   `patched` 는 단순 counting flag, `external_id` 는 WHERE 절에 쓰이는 키.
  //   포함하면 Supabase 가 "Could not find the 'patched' column" 에러로 모든 UPDATE 가 실패한다.
  for (const row of toUpdate) {
    const { external_id, patched, ...updatePayload } = row;
    void external_id;
    const { error: updateErr } = await supabase
      .from("pre_spec_notices")
      .update(updatePayload as never)
      .eq("external_id", row.external_id);
    if (updateErr) {
      summary.errors.push(
        `pre_spec_notices UPDATE 실패 (${row.external_id}): ${updateErr.message}`,
      );
      summary.skipped += 1;
    } else {
      summary.updated += 1;
      if (patched) summary.urlPatched += 1;
    }
  }

  return summary;
}
