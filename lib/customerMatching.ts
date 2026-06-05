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
   *  - "alias"      : 수동 alias 사전 매핑 (예: "국회" ↔ "국회사무처")
   *  - "contains"   : 정규화값이 한쪽 안에 substring 으로 포함되는 경우
   *  - "fuzzy"      : Levenshtein 기반 유사도 임계 이상 (오탐 방지를 위해 보수적 임계 사용)
   *
   * 매칭 자체에 실패한 agency 는 응답 매핑에 포함되지 않으므로
   * "none" 은 의미상으로만 존재한다(타입 union 에는 포함하지 않는다).
   */
  matchType: "exact" | "normalized" | "alias" | "contains" | "fuzzy";
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

/** 매칭 단계 → 한글 라벨 (디버그/툴팁용). */
export function formatMatchTypeLabel(
  matchType: MatchedCustomer["matchType"] | "unmatched" | null | undefined,
): string {
  switch (matchType) {
    case "exact":
      return "정확 일치";
    case "normalized":
      return "정규화 일치";
    case "alias":
      return "동의어 사전";
    case "contains":
      return "포함관계 일치";
    case "fuzzy":
      return "유사도 매칭";
    default:
      return "미매칭";
  }
}

// ============================================================================
// Alias / Fuzzy 매칭
// ----------------------------------------------------------------------------
// 1) ALIAS_GROUPS: 수동으로 관리하는 동의어 묶음.
//    예) "국회" / "국회사무처" / "대한민국국회" 는 같은 기관으로 본다.
//    각 그룹의 모든 멤버는 다른 멤버들을 alias 로 가진다(자동 양방향).
// 2) findAliasCandidates(agency, lookup): agency 와 같은 그룹의 멤버 중
//    customer_accounts 에 존재하는 row 를 반환.
// 3) findFuzzyMatch(agencyNorm, rows): 정규화값 기반 Levenshtein 유사도가
//    임계(LEN/LEN 비율 모두) 를 통과하는 row 만 매칭.
// ============================================================================

/**
 * 동의어 그룹.
 *
 * 한 줄에 들어간 이름들은 같은 기관으로 본다. 각 멤버는 자동 양방향 alias 가 된다.
 *
 * 운영 중 누락 사례가 보고되면 이 배열에 추가하면 된다(코드 변경 + 배포 필요).
 * 추후 Supabase 의 customer_accounts 에 alias 컬럼을 둘 수 있으나, 1차에서는 코드 dict 로 충분.
 */
const ALIAS_GROUPS: string[][] = [
  ["국회", "국회사무처", "대한민국국회", "국회예산정책처", "국회입법조사처", "국회도서관"],
  ["서울특별시", "서울시", "서울"],
  ["부산광역시", "부산시", "부산"],
  ["대구광역시", "대구시", "대구"],
  ["인천광역시", "인천시", "인천"],
  ["광주광역시", "광주시", "광주"],
  ["대전광역시", "대전시", "대전"],
  ["울산광역시", "울산시", "울산"],
  ["세종특별자치시", "세종시", "세종"],
  ["경기도", "경기"],
  ["강원특별자치도", "강원도", "강원"],
  ["충청북도", "충북"],
  ["충청남도", "충남"],
  ["전라북도", "전북", "전북특별자치도"],
  ["전라남도", "전남"],
  ["경상북도", "경북"],
  ["경상남도", "경남"],
  ["제주특별자치도", "제주도", "제주"],
  ["한국교육학술정보원", "KERIS", "keris"],
  ["한국지능정보사회진흥원", "NIA", "nia", "한국정보화진흥원"],
  ["한국전자통신연구원", "ETRI", "etri"],
  ["한국과학기술정보연구원", "KISTI", "kisti"],
  ["한국인터넷진흥원", "KISA", "kisa"],
  ["국민건강보험공단", "건강보험공단"],
  ["한국전력공사", "한전", "KEPCO", "kepco"],
  ["한국가스공사", "가스공사"],
  ["한국수자원공사", "수자원공사", "K-water", "k-water"],
  ["한국토지주택공사", "LH", "lh", "토지주택공사"],
  ["한국도로공사", "도로공사"],
  ["한국철도공사", "철도공사", "코레일", "korail", "KORAIL"],
];

/**
 * customer_name_norm 단위 alias 맵.
 *  key: 정규화된 멤버 이름 (한 줄 내의 임의 멤버)
 *  value: 같은 그룹의 다른 멤버들의 정규화된 이름 (자기 자신 포함)
 */
function buildAliasNormMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const group of ALIAS_GROUPS) {
    const norms = group.map((name) => normalizeCustomerName(name)).filter((n) => n.length > 0);
    if (norms.length < 2) continue;
    for (const member of norms) {
      // 같은 그룹 내 모든 정규화 이름을 후보로 둔다 (자기 자신 포함; lookup 단순화 용도)
      const existing = map.get(member);
      const merged = existing ? [...new Set([...existing, ...norms])] : [...norms];
      map.set(member, merged);
    }
  }
  return map;
}

const ALIAS_NORM_MAP = buildAliasNormMap();

/**
 * agency 의 정규화 이름이 alias 그룹에 속해 있을 때, 같은 그룹의 다른 정규화 이름 중
 * lookup.byNormalized 에 존재하는 첫 row 를 반환한다.
 */
export function matchAliasFromAgency(
  agency: string | null | undefined,
  lookup: CustomerLookup,
): MatchedCustomer | null {
  const trimmed = (agency ?? "").trim();
  if (!trimmed) return null;
  const norm = normalizeCustomerName(trimmed);
  if (!norm) return null;

  const candidates = ALIAS_NORM_MAP.get(norm);
  if (!candidates || candidates.length === 0) return null;

  for (const candidateNorm of candidates) {
    if (candidateNorm === norm) continue; // 정규화 매칭은 이미 시도됨
    const row = lookup.byNormalized.get(candidateNorm);
    if (row) return toMatched(row, "alias");
  }
  return null;
}

/**
 * 양방향 contains 매칭 — agency 안에 customer 가 들어가거나, customer 안에 agency 가 들어가는 경우.
 *
 * 기존 findBestContainsMatch 는 agency 안에 customer 가 들어가는 한 방향만 허용했다.
 * "국회사무처" → "국회" 같은 케이스는 정규화 길이가 너무 짧아 실용적이지 않으므로
 * alias 사전이 일차적으로 처리한다. 이 함수는 두 정규화 이름이 모두 길이 임계를 넘는 경우에 한해
 * 반대 방향(customer 안에 agency)도 허용해 매칭률을 끌어올린다.
 *
 * 길이/블록리스트 규칙은 동일.
 */
export function findBestBidirectionalContainsMatch(
  agencyNorm: string,
  rows: CustomerAccountRow[],
): { row: CustomerAccountRow; direction: "customer-in-agency" | "agency-in-customer" } | null {
  const a = (agencyNorm ?? "").trim();
  if (a.length < CONTAINS_MIN_LEN) return null;

  let best: { row: CustomerAccountRow; direction: "customer-in-agency" | "agency-in-customer" } | null = null;
  let bestLen = 0;

  for (const row of rows) {
    const cn = (row.customer_name_norm ?? "").trim();
    if (cn.length < CONTAINS_MIN_LEN) continue;
    if (GENERIC_CUSTOMER_NAME_BLOCKLIST.has(cn)) continue;

    if (a.includes(cn)) {
      // customer ⊆ agency: 가장 안전한 방향. 후보 중 가장 긴 customer 우선.
      if (cn.length > bestLen) {
        best = { row, direction: "customer-in-agency" };
        bestLen = cn.length;
      }
    } else if (cn.includes(a)) {
      // agency ⊆ customer: 반대 방향. customer 가 agency 보다 너무 길면 의미가 약하므로
      // 길이 차이 임계(< 4) 이내로 제한해 오탐 줄임.
      if (cn.length - a.length <= 4 && a.length > bestLen) {
        best = { row, direction: "agency-in-customer" };
        bestLen = a.length;
      }
    }
  }
  return best;
}

/** 두 문자열의 Levenshtein 거리. small string (≤ 64) 가정. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  // single-row DP
  let prev = new Array(bl + 1);
  for (let j = 0; j <= bl; j += 1) prev[j] = j;
  for (let i = 1; i <= al; i += 1) {
    const curr = new Array(bl + 1);
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j += 1) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[bl];
}

/**
 * 정규화 문자열 기반 유사도. 1.0 이 완전 일치, 0.0 이 전혀 다른 경우.
 * Levenshtein 거리 / max(len) 으로 normalize.
 */
export function similarityScore(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

/** Fuzzy 매칭 임계치. 짧은 이름(< 8자)은 더 보수적으로. */
function fuzzyThresholdFor(len: number): number {
  if (len < 6) return 0.95; // 너무 짧으면 사실상 alias 만 통과 가능
  if (len < 10) return 0.9;
  return 0.85;
}

/**
 * 유사도 기반 매칭. 후보 row 중 임계치를 통과하는 가장 높은 점수의 row 반환.
 *
 * 오탐 방지를 위해 다음 가드 적용:
 *  - 길이 차이 > 3 이면 후보에서 제외
 *  - 길이 6 미만 양쪽은 매칭 금지
 *  - 임계치는 길이별로 동적
 */
export function findBestFuzzyMatch(
  agencyNorm: string,
  rows: CustomerAccountRow[],
): { row: CustomerAccountRow; score: number } | null {
  const a = (agencyNorm ?? "").trim();
  if (a.length < 6) return null;

  let best: { row: CustomerAccountRow; score: number } | null = null;

  for (const row of rows) {
    const cn = (row.customer_name_norm ?? "").trim();
    if (cn.length < 6) continue;
    if (GENERIC_CUSTOMER_NAME_BLOCKLIST.has(cn)) continue;
    if (Math.abs(cn.length - a.length) > 3) continue;

    const score = similarityScore(a, cn);
    const minLen = Math.min(a.length, cn.length);
    const threshold = fuzzyThresholdFor(minLen);
    if (score < threshold) continue;
    if (!best || score > best.score) {
      best = { row, score };
    }
  }
  return best;
}
