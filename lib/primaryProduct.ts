import type { Notice } from "@/data/sampleNotices";

/**
 * 카드 카운트(상단 요약) 와 "주제품" 표시에 쓰는 단일 제품 분류.
 *
 * 기존에는 `relatedProducts` 에 CONTRABASS 와 VIOLA 가 동시에 있는 공고가
 * 양쪽 카드에 모두 +1 되어 카드 합계가 전체보다 커지는 문제가 있었다.
 *  → 한 공고당 정확히 하나의 primaryProduct 를 골라 카드 카운트는 그 기준으로만 잡는다.
 *
 * 결정 규칙(우선순위):
 *  1. CONTRABASS family 와 VIOLA 가 모두 있으면 → 키워드/제목/요약/raw 텍스트에서
 *     어느 제품의 "강한 시그널"이 더 많이 등장하는지로 결정.
 *  2. 동률이거나 강한 시그널이 모두 0 인 경우 → CONTRABASS 우선.
 *  3. 한쪽만 있으면 그쪽.
 *  4. 둘 다 없으면 null.
 */
export type PrimaryProduct = "CONTRABASS" | "VIOLA" | null;

const CONTRABASS_FAMILY = new Set(["CONTRABASS", "CONTRABASS Legato", "CONTRABASS SDS+"]);

/**
 * 제품별 강한 시그널 키워드.
 *
 * `app/api/collect-g2b-keywords/route.ts` 의 PRODUCT_KEYWORD_MAP 와 동일한 정신을 따르되,
 * 화면 분류용이라 가장 변별력이 높은 표현 위주로 추렸다.
 * 너무 broad 한 단어("플랫폼", "정보시스템")는 분류 효과가 떨어져 의도적으로 제외.
 */
const CONTRABASS_SIGNAL_KEYWORDS = [
  "가상화",
  "vmware",
  "vm웨어",
  "openstack",
  "오픈스택",
  "hci",
  "iaas",
  "프라이빗 클라우드",
  "사설 클라우드",
  "클라우드 인프라",
  "데이터센터",
  "전산센터",
  "서버 가상화",
  "서버 통합",
  "x86 서버",
];

const VIOLA_SIGNAL_KEYWORDS = [
  "kubernetes",
  "쿠버네티스",
  "k8s",
  "paas",
  "컨테이너",
  "container",
  "openshift",
  "오픈시프트",
  "msa",
  "마이크로서비스",
  "devops",
  "데브옵스",
  "ci/cd",
  "cicd",
];

function buildHaystack(notice: Notice & { rawData?: string }): string {
  return [
    notice.title,
    notice.summary ?? "",
    ...(notice.keywords ?? []),
    notice.rawData ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function countSignalHits(haystack: string, signals: readonly string[]): number {
  let hits = 0;
  for (const sig of signals) {
    if (sig && haystack.includes(sig)) hits += 1;
  }
  return hits;
}

export function getPrimaryProduct(notice: Notice & { rawData?: string }): PrimaryProduct {
  const products = notice.relatedProducts ?? [];
  const hasContrabass = products.some((p) => CONTRABASS_FAMILY.has(p));
  const hasViola = products.includes("VIOLA");

  if (!hasContrabass && !hasViola) return null;
  if (hasContrabass && !hasViola) return "CONTRABASS";
  if (!hasContrabass && hasViola) return "VIOLA";

  // 둘 다 매칭된 경우 — 시그널 키워드 hit 수 비교
  const haystack = buildHaystack(notice);
  const cHits = countSignalHits(haystack, CONTRABASS_SIGNAL_KEYWORDS);
  const vHits = countSignalHits(haystack, VIOLA_SIGNAL_KEYWORDS);

  if (cHits === vHits) return "CONTRABASS"; // 동률은 CONTRABASS 우선 (기본 영업 비중)
  return cHits > vHits ? "CONTRABASS" : "VIOLA";
}
