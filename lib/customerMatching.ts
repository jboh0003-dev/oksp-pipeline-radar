import type { CustomerAccountRow } from "@/lib/supabase";

/**
 * 매칭된 고객사 정보. 공고 카드/테이블에 부착된다.
 * customer_name_norm 으로 lookup 한 결과의 사용 친화적 변형.
 */
export type MatchedCustomer = {
  customerId: string;
  customerName: string;
  /** Named / Non Named (엑셀 F 열). NULL 이면 미상. */
  accountType: string | null;
  /** 26 테리토리 (담당본부). */
  territory: string | null;
  /** "지방/수도권" 같은 그룹. */
  regionGroup: string | null;
  /** "서울/인천/경기" 같은 세부 지역. */
  region: string | null;
  /**
   * 매칭 단계.
   *  - "exact"      : 공고 agency 와 customer_name 정확 일치
   *  - "normalized" : 공백/괄호/법인표기 제거 후 정규화 키 일치
   *  - "contains"   : agency 정규화값 안에 customer_name_norm 전체가 substring 으로 포함
   *                   (단, 6자 미만이거나 GENERIC_CUSTOMER_NAME_BLOCKLIST 에 있는 값은 제외)
   *
   * 매칭 자체에 실패한 agency 는 응답 매핑에 포함되지 않으므로
   * "none" 은 의미상으로만 존재한다(타입 union 에는 포함하지 않는다).
   */
  matchType: "exact" | "normalized" | "contains";
};

/**
 * 포함관계 매칭에 적용되는 customer_name_norm 최소 길이.
 * 6자 미만은 일반 명사·suffix 와 겹칠 가능성이 커 오탐 위험이 높아 차단한다.
 */
export const CONTAINS_MIN_LEN = 6;

/**
 * customer_name_norm 자체가 이 값과 동일하면 포함관계 매칭에서 제외한다.
 * "한국공항공사", "국립환경과학원" 처럼 suffix 가 들어간 더 긴 이름은 정상 매칭된다.
 *
 * 길이 6 임계값으로 대부분이 이미 차단되지만, 한자어 조합으로 6자 이상이면서
 * 매우 일반적인 단어가 들어올 경우를 위해 명시적 블록리스트도 함께 둔다.
 */
export const GENERIC_CUSTOMER_NAME_BLOCKLIST = new Set<string>([
  "공사",
  "공단",
  "체육회",
  "연구원",
  "대학교",
  "병원",
  "시청",
  "구청",
  "군청",
  "도청",
  "교육청",
  "위원회",
  "재단",
  "협회",
  "센터",
  "본부",
  "법인",
]);

/**
 * 고객사명 정규화.
 * 매칭 키로 쓰기 위해 공백/괄호/법인 표기 등을 제거한 표준형을 만든다.
 *
 * - 괄호 (...) 와 안 내용 제거 → "OO은행 (서울지점)" → "OO은행"
 * - 법인 표기 제거: 주식회사, ㈜, (주), 유한회사, (유), 재단법인, 사단법인, 학교법인, 의료법인
 * - 공백 모두 제거
 * - lowercase
 */
export function normalizeCustomerName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\([^)]*\)/g, "")
    .replace(/[（）()]/g, "")
    .replace(/㈜|\(주\)|주식회사/g, "")
    .replace(/\(유\)|유한회사/g, "")
    .replace(/\(재\)|재단법인/g, "")
    .replace(/\(사\)|사단법인/g, "")
    .replace(/\(학\)|학교법인/g, "")
    .replace(/\(의\)|의료법인/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

/**
 * 매칭에 사용할 인덱스. 한 번 빌드해서 여러 공고에 재사용한다.
 *
 *  - byExact: 원본 customer_name 그대로 → row
 *  - byNormalized: 정규화된 customer_name_norm → row
 */
export type CustomerLookup = {
  byExact: Map<string, CustomerAccountRow>;
  byNormalized: Map<string, CustomerAccountRow>;
};

export function buildCustomerLookup(rows: CustomerAccountRow[]): CustomerLookup {
  const byExact = new Map<string, CustomerAccountRow>();
  const byNormalized = new Map<string, CustomerAccountRow>();
  for (const row of rows) {
    const exact = (row.customer_name ?? "").trim();
    if (exact && !byExact.has(exact)) byExact.set(exact, row);
    const norm = (row.customer_name_norm ?? "").trim();
    if (norm && !byNormalized.has(norm)) byNormalized.set(norm, row);
  }
  return { byExact, byNormalized };
}

function toMatched(row: CustomerAccountRow, matchType: MatchedCustomer["matchType"]): MatchedCustomer {
  return {
    customerId: row.id,
    customerName: row.customer_name,
    accountType: row.account_type,
    territory: row.territory,
    regionGroup: row.region_group,
    region: row.region,
    matchType,
  };
}

/**
 * 공고 기관명과 고객사 마스터를 매칭한다.
 *  - 1차: 공고 agency 와 customer_name 정확 일치
 *  - 2차: 정규화 후 일치
 * 일부러 fuzzy 매칭은 도입하지 않는다. 오탐 방지가 우선.
 */
export function matchCustomerFromAgency(
  agency: string | null | undefined,
  lookup: CustomerLookup,
): MatchedCustomer | null {
  const trimmed = (agency ?? "").trim();
  if (!trimmed) return null;

  const exact = lookup.byExact.get(trimmed);
  if (exact) return toMatched(exact, "exact");

  const norm = normalizeCustomerName(trimmed);
  if (!norm) return null;

  const byNorm = lookup.byNormalized.get(norm);
  if (byNorm) return toMatched(byNorm, "normalized");

  return null;
}

/**
 * 포함관계(contains) 매칭. exact / normalized 에서 실패한 agency 에만 적용한다.
 *
 * 규칙 (오탐 최소화):
 *  1) `agencyNorm.length` >= CONTAINS_MIN_LEN 이어야 한다.
 *  2) 후보 row 의 customer_name_norm 도 CONTAINS_MIN_LEN 이상이어야 한다.
 *  3) customer_name_norm 이 GENERIC_CUSTOMER_NAME_BLOCKLIST 에 있으면 제외.
 *  4) customer_name_norm 전체가 agencyNorm 의 substring 이어야 한다.
 *     (반대 방향 — agency 가 customer 안에 들어있는 경우 — 은 의도적으로 허용하지 않는다.
 *      "경기도체육회" / "대한체육회" 같은 generic suffix 매칭을 차단하기 위함.)
 *  5) 후보가 여러 개면 가장 긴 customer_name_norm 을 선택한다.
 *     (예: "기후에너지환경부 국립환경과학원" → "환경부" / "국립환경과학원" 두 후보 중 후자 선택)
 *
 * 호출자는 후보 row 풀을 직접 넘긴다. 풀의 크기와 프리필터링은 호출자 책임.
 */
export function findBestContainsMatch(
  agencyNorm: string,
  rows: CustomerAccountRow[],
): CustomerAccountRow | null {
  const a = (agencyNorm ?? "").trim();
  if (a.length < CONTAINS_MIN_LEN) return null;

  let best: CustomerAccountRow | null = null;
  let bestLen = 0;
  for (const row of rows) {
    const cn = (row.customer_name_norm ?? "").trim();
    if (cn.length < CONTAINS_MIN_LEN) continue;
    if (GENERIC_CUSTOMER_NAME_BLOCKLIST.has(cn)) continue;
    if (!a.includes(cn)) continue;
    if (cn.length > bestLen) {
      best = row;
      bestLen = cn.length;
    }
  }
  return best;
}

/** account_type 값을 화면 라벨로 정규화. "Named" / "Non Named" / NULL 모두 안전 처리. */
export function formatAccountTypeLabel(accountType: string | null | undefined): string {
  if (!accountType) return "미매칭";
  const trimmed = accountType.trim();
  if (!trimmed) return "미매칭";
  // 흔한 표기 흔들림(공백 / 대소문자) 정규화
  const lower = trimmed.toLowerCase().replace(/\s+/g, "");
  if (lower === "named") return "Named";
  if (lower === "nonnamed" || lower === "non-named") return "Non Named";
  return trimmed;
}
