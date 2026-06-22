import { NextRequest } from "next/server";
import {
  buildCustomerLookup,
  CONTAINS_MIN_LEN,
  findBestBidirectionalContainsMatch,
  findBestFuzzyMatch,
  matchAliasFromAgency,
  matchCustomerFromAgency,
  normalizeCustomerName,
  type MatchedCustomer,
} from "@/lib/customerMatching";
import { jsonFail, jsonOk, withApiRoute } from "@/lib/apiResponse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { CustomerAccountRow } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 한 번 호출 당 처리할 최대 agency 수. 비정상 트래픽 보호용 상한선. */
const MAX_AGENCIES = 1000;

/**
 * `.in()` 한 번에 보낼 값 개수.
 * 한국어 + 괄호/공백이 섞인 문자열을 200개 가까이 넣으면 PostgREST 가
 * `HeadersOverflowError`(16KB header 한계)로 실패한다. 50개 단위가 안전.
 */
const QUERY_CHUNK = 50;

/** customer_accounts 전체를 한 번 읽어오는 페이지 크기. */
const FULL_FETCH_PAGE = 1000;

/** customer_accounts 전체 풀의 모듈 레벨 캐시 TTL. */
const ALL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * 매칭 단계. "none" 은 응답 map 에는 포함되지 않지만 의미상의 enumeration 으로 둔다.
 */
export type MatchType = "exact" | "normalized" | "alias" | "contains" | "fuzzy" | "none";

/** 클라이언트에 내려줄 매칭 결과. customerId 등 내부 식별자는 빼고 화면 표시용 필드만 노출. */
export type CustomerMatchPayload = Pick<
  MatchedCustomer,
  "customerName" | "accountType" | "territory" | "regionGroup" | "region"
> & { matchType: Exclude<MatchType, "none"> };

export type CustomerMatchResponse = {
  /** 매칭에 성공한 agency → CustomerMatchPayload. 미매칭(none)은 키 자체를 누락. */
  matches: Record<string, CustomerMatchPayload>;
  meta: {
    requested: number;
    matched: number;
    breakdown: {
      exact: number;
      normalized: number;
      alias: number;
      contains: number;
      fuzzy: number;
      none: number;
    };
  };
};

const SELECT_COLS =
  "id, customer_name, customer_name_norm, customer_group, account_type, territory, region_group, region, address, business_number, source_file, updated_at";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

function pickPayload(
  row: CustomerAccountRow,
  matchType: CustomerMatchPayload["matchType"],
): CustomerMatchPayload {
  return {
    customerName: row.customer_name,
    accountType: row.account_type,
    territory: row.territory,
    regionGroup: row.region_group,
    region: row.region,
    matchType,
  };
}

/** column IN (...) 를 청크 단위로 분할 실행한 뒤 dedupe 한다. */
async function fetchInChunks(
  supabase: AdminClient,
  column: "customer_name" | "customer_name_norm",
  values: string[],
): Promise<{ rows: CustomerAccountRow[]; error: string | null }> {
  const merged = new Map<string, CustomerAccountRow>();
  for (let i = 0; i < values.length; i += QUERY_CHUNK) {
    const chunk = values.slice(i, i + QUERY_CHUNK);
    const { data, error } = await supabase
      .from("customer_accounts")
      .select(SELECT_COLS)
      .in(column, chunk);
    if (error) {
      return { rows: [...merged.values()], error: error.message ?? "supabase error" };
    }
    for (const row of (data ?? []) as CustomerAccountRow[]) {
      merged.set(row.id, row);
    }
  }
  return { rows: [...merged.values()], error: null };
}

/**
 * customer_accounts 전체 풀을 모듈 캐시로 보관한다.
 * - exact / normalized 단계에서 미매칭이 남은 경우에만 contains 매칭을 위해 사용.
 * - import 직후에도 5분 안에 매칭 결과에 반영되며, 그 이상 즉시 반영이 필요하면 dev 서버를 재시작.
 */
let cachedAllRows: CustomerAccountRow[] | null = null;
let cachedAllExpiresAt = 0;

async function getAllCustomerRows(supabase: AdminClient): Promise<{
  rows: CustomerAccountRow[];
  cached: boolean;
  error: string | null;
}> {
  const now = Date.now();
  if (cachedAllRows && now < cachedAllExpiresAt) {
    return { rows: cachedAllRows, cached: true, error: null };
  }
  const all: CustomerAccountRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("customer_accounts")
      .select(SELECT_COLS)
      .range(from, from + FULL_FETCH_PAGE - 1);
    if (error) {
      return { rows: all, cached: false, error: error.message ?? "supabase error" };
    }
    const rows = (data ?? []) as CustomerAccountRow[];
    all.push(...rows);
    if (rows.length < FULL_FETCH_PAGE) break;
    from += FULL_FETCH_PAGE;
  }
  cachedAllRows = all;
  cachedAllExpiresAt = now + ALL_CACHE_TTL_MS;
  return { rows: all, cached: false, error: null };
}

export async function POST(request: NextRequest) {
  return withApiRoute("/api/customer-accounts/match", async () => handleMatch(request));
}

async function handleMatch(request: NextRequest) {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return jsonFail("요청 본문이 올바른 JSON 형식이 아닙니다.", { status: 400 });
  }

  const inputAgencies = Array.isArray((parsed as { agencies?: unknown }).agencies)
    ? ((parsed as { agencies: unknown[] }).agencies as unknown[])
    : [];

  const cleaned = inputAgencies
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (cleaned.length > MAX_AGENCIES) {
    return jsonFail(`요청 기관 수가 너무 많습니다. (최대 ${MAX_AGENCIES}건)`, {
      status: 400,
      detail: `received=${cleaned.length}`,
    });
  }

  if (cleaned.length === 0) {
    const empty: CustomerMatchResponse = {
      matches: {},
      meta: {
        requested: 0,
        matched: 0,
        breakdown: { exact: 0, normalized: 0, alias: 0, contains: 0, fuzzy: 0, none: 0 },
      },
    };
    return jsonOk(empty, { message: "매칭할 기관이 없습니다." });
  }

  const uniqueAgencies = [...new Set(cleaned)];
  const normalizedKeys = [
    ...new Set(uniqueAgencies.map((a) => normalizeCustomerName(a)).filter((n) => n.length > 0)),
  ];

  // 디버그 로그 — 운영 중 미매칭 원인 추적용
  console.log(
    `[/api/customer-accounts/match] requested=${uniqueAgencies.length} normalized=${normalizedKeys.length} ` +
      `sampleNorm=${JSON.stringify(normalizedKeys.slice(0, 5))}`,
  );

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return jsonFail("고객사 매칭 서비스를 사용할 수 없습니다.", {
      status: 500,
      detail: "Supabase service role client unavailable",
    });
  }

  // 1단계 + 2단계: exact / normalized — 청크 .in() 으로 가져온다.
  const [exactRes, normRes] = await Promise.all([
    fetchInChunks(supabase, "customer_name", uniqueAgencies),
    normalizedKeys.length > 0
      ? fetchInChunks(supabase, "customer_name_norm", normalizedKeys)
      : Promise.resolve({ rows: [] as CustomerAccountRow[], error: null }),
  ]);

  if (exactRes.error || normRes.error) {
    const msg = exactRes.error ?? normRes.error;
    console.error("[/api/customer-accounts/match] supabase error:", msg);
    return jsonFail("고객사 정보 조회에 실패했습니다.", {
      status: 500,
      detail: msg ?? "customer_accounts 조회 실패",
    });
  }

  const lookupRows = new Map<string, CustomerAccountRow>();
  for (const row of exactRes.rows) lookupRows.set(row.id, row);
  for (const row of normRes.rows) lookupRows.set(row.id, row);

  console.log(
    `[/api/customer-accounts/match] fetched customer_accounts rows=${lookupRows.size} ` +
      `(exact=${exactRes.rows.length}, normalized=${normRes.rows.length})`,
  );

  const lookup = buildCustomerLookup([...lookupRows.values()]);

  const matches: Record<string, CustomerMatchPayload> = {};
  const stillMissing: string[] = [];
  let exactCount = 0;
  let normalizedCount = 0;

  // 1단계: exact / normalized
  for (const agency of uniqueAgencies) {
    const m = matchCustomerFromAgency(agency, lookup);
    if (!m) {
      stillMissing.push(agency);
      continue;
    }
    if (m.matchType === "exact") {
      exactCount += 1;
    } else if (m.matchType === "normalized") {
      normalizedCount += 1;
    }
    matches[agency] = {
      customerName: m.customerName,
      accountType: m.accountType,
      territory: m.territory,
      regionGroup: m.regionGroup,
      region: m.region,
      matchType: m.matchType === "exact" ? "exact" : "normalized",
    };
  }

  // 2단계: alias 사전 (예: "국회" ↔ "국회사무처") — customer_accounts 전체 풀 기준으로 매칭한다.
  // 1단계 lookup 만으로는 "국회" 로 fetch 한 row 안에 "국회사무처" 가 들어있을 수 없어 매칭 실패.
  // contains/fuzzy 와 동일하게 전체 풀(getAllCustomerRows)에서 alias group 멤버를 찾는다.
  let aliasCount = 0;
  let containsCount = 0;
  let fuzzyCount = 0;
  if (stillMissing.length > 0) {
    const all = await getAllCustomerRows(supabase);
    if (all.error) {
      console.warn(
        `[/api/customer-accounts/match] alias/contains/fuzzy 풀 fetch 실패, 세 단계 모두 건너뜀: ${all.error}`,
      );
    } else {
      console.log(
        `[/api/customer-accounts/match] alias/contains/fuzzy pool=${all.rows.length} (cached=${all.cached}) missing=${stillMissing.length}`,
      );

      const fullLookup = buildCustomerLookup(all.rows);

      // 2-A: alias
      const afterAlias: string[] = [];
      for (const agency of stillMissing) {
        const m = matchAliasFromAgency(agency, fullLookup);
        if (!m) {
          afterAlias.push(agency);
          continue;
        }
        matches[agency] = pickPayload(
          {
            id: m.customerId,
            customer_name: m.customerName,
            customer_name_norm: "",
            customer_group: null,
            account_type: m.accountType,
            territory: m.territory,
            region_group: m.regionGroup,
            region: m.region,
            address: null,
            business_number: null,
            source_file: null,
            updated_at: null,
          } as CustomerAccountRow,
          "alias",
        );
        aliasCount += 1;
        console.log(`alias match: "${agency}" -> "${m.customerName}"`);
      }

      // 2-B: contains (양방향)
      const afterContains: string[] = [];
      for (const agency of afterAlias) {
        const norm = normalizeCustomerName(agency);
        if (norm.length < CONTAINS_MIN_LEN) {
          afterContains.push(agency);
          continue;
        }
        const found = findBestBidirectionalContainsMatch(norm, all.rows);
        if (!found) {
          afterContains.push(agency);
          continue;
        }
        matches[agency] = pickPayload(found.row, "contains");
        containsCount += 1;
        console.log(
          `contains match (${found.direction}): "${agency}" -> "${found.row.customer_name}"`,
        );
      }

      // 2-C: fuzzy
      for (const agency of afterContains) {
        const norm = normalizeCustomerName(agency);
        if (norm.length < 6) continue;
        const found = findBestFuzzyMatch(norm, all.rows);
        if (!found) continue;
        matches[agency] = pickPayload(found.row, "fuzzy");
        fuzzyCount += 1;
        console.log(
          `fuzzy match (sim=${found.score.toFixed(3)}): "${agency}" -> "${found.row.customer_name}"`,
        );
      }
    }
  }

  const matchedTotal = exactCount + normalizedCount + aliasCount + containsCount + fuzzyCount;
  const noneCount = uniqueAgencies.length - matchedTotal;
  console.log(
    `[/api/customer-accounts/match] matched total=${matchedTotal} ` +
      `(exact=${exactCount}, normalized=${normalizedCount}, alias=${aliasCount}, ` +
      `contains=${containsCount}, fuzzy=${fuzzyCount}, none=${noneCount}) / ` +
      `requested=${uniqueAgencies.length}`,
  );

  const response: CustomerMatchResponse = {
    matches,
    meta: {
      requested: uniqueAgencies.length,
      matched: matchedTotal,
      breakdown: {
        exact: exactCount,
        normalized: normalizedCount,
        alias: aliasCount,
        contains: containsCount,
        fuzzy: fuzzyCount,
        none: noneCount,
      },
    },
  };
  return jsonOk(response);
}
