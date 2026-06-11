/**
 * 키워드 룰 기반 매칭 / 점수 계산.
 *
 *  - lib/matching/keywords 의 룰을 한 번에 적용해 (제목, 본문) → {products, scores, hits, negatives, excluded}
 *    형태로 변환한다.
 *  - 입찰공고와 사전규격공고가 모두 이 함수로 점수를 계산하도록 통일.
 *
 * 점수 정책:
 *  - strong  : +3
 *  - normal  : +2
 *  - weak    : +1, 단 같은 제품의 strong / normal 가 한 번이라도 잡혀야 가산 (단독 weak 는 점수 X)
 *  - titleBoost: 제목에 strong 키워드가 잡혔을 때 한 번에 +2 (제품별로 한 번만)
 *  - negative: 별도 누적 weight (점수 자체엔 영향 없음, 등급 다운그레이드용)
 *  - exclude: 한 개라도 잡히면 excluded=true
 */

import {
  KEYWORD_RULES,
  PRODUCT_KEYS,
  type ProductKey,
} from "@/lib/matching/keywords";

export type ProductScore = {
  product: ProductKey;
  score: number;
  /** 점수에 기여한 키워드 목록 (중복 제거). */
  hits: string[];
};

export type ScoreResult = {
  /** 점수 ≥ 1 인 제품 (점수 내림차순). */
  products: ProductKey[];
  primaryProduct: ProductKey | null;
  productScores: Partial<Record<ProductKey, number>>;
  productHits: Partial<Record<ProductKey, string[]>>;
  /** 모든 매칭 키워드 (다양한 제품에 걸쳐 hit 된 키워드 합집합). */
  matchedKeywords: string[];
  /** 음수 신호 누적 weight — 등급 다운그레이드 판단용. */
  negativeWeight: number;
  /** 매칭된 negative 키워드 목록. */
  negativeHits: string[];
  /** 즉시 제외 (exclude 키워드 매칭) 여부. */
  excluded: boolean;
  /** 제외 사유 키워드. */
  excludeReason?: string;
  /** 사람이 읽기 쉬운 reason 문자열 — 디버깅 / 화면 노출 가능. */
  matchReason: string;
};

const lower = (s: string) => s.toLowerCase();

function findHit(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.includes(lower(needle));
}

export type ScoreOptions = {
  /** 제목 (titleBoost 용) — 본문과 중복돼도 OK. */
  title?: string;
  /** 본문 — 키워드/요약/태그를 합친 자유 텍스트. */
  body?: string;
};

/**
 * 단일 텍스트(제목+본문) 에 키워드 룰을 적용해 점수를 산출.
 *
 *  - 같은 제품에서 strong/normal 가 한 번이라도 잡혔는지 여부에 따라 weak 가산을 결정.
 *  - 제품별 productScore 가 ≥1 이면 products 배열에 포함.
 *  - excluded=true 면 호출부가 후보에서 즉시 제거.
 */
export function scoreText(opts: ScoreOptions): ScoreResult {
  const titleLower = lower(opts.title ?? "");
  const fullText = lower(`${opts.title ?? ""}\n${opts.body ?? ""}`);

  const productScores: Partial<Record<ProductKey, number>> = {};
  const productHits: Partial<Record<ProductKey, Set<string>>> = {};
  const allMatched = new Set<string>();

  // 어떤 제품에 대해 strong 또는 normal 매칭이 있었는지 — weak 가산 조건.
  const hasStrongOrNormal: Partial<Record<ProductKey, boolean>> = {};
  // 제품별 titleBoost 누적 (한 번만).
  const titleBoosted: Partial<Record<ProductKey, boolean>> = {};

  // 1) strong / normal 먼저 적용.
  for (const rule of KEYWORD_RULES) {
    if (!rule.product) continue;
    if (rule.type !== "strong" && rule.type !== "normal") continue;
    if (!findHit(fullText, rule.keyword)) continue;
    productScores[rule.product] = (productScores[rule.product] ?? 0) + rule.weight;
    if (!productHits[rule.product]) productHits[rule.product] = new Set();
    productHits[rule.product]!.add(rule.keyword);
    allMatched.add(rule.keyword);
    hasStrongOrNormal[rule.product] = true;
    if (rule.type === "strong" && titleLower.includes(lower(rule.keyword)) && !titleBoosted[rule.product]) {
      productScores[rule.product] = (productScores[rule.product] ?? 0) + 2;
      titleBoosted[rule.product] = true;
    }
  }

  // 2) weak 는 같은 제품의 strong/normal 가 잡힌 경우에만 가산.
  for (const rule of KEYWORD_RULES) {
    if (!rule.product) continue;
    if (rule.type !== "weak") continue;
    if (!findHit(fullText, rule.keyword)) continue;
    if (!hasStrongOrNormal[rule.product]) continue;
    productScores[rule.product] = (productScores[rule.product] ?? 0) + rule.weight;
    if (!productHits[rule.product]) productHits[rule.product] = new Set();
    productHits[rule.product]!.add(rule.keyword);
    allMatched.add(rule.keyword);
  }

  // 3) negative.
  let negativeWeight = 0;
  const negativeHitsSet = new Set<string>();
  for (const rule of KEYWORD_RULES) {
    if (rule.type !== "negative") continue;
    if (!findHit(fullText, rule.keyword)) continue;
    if (negativeHitsSet.has(rule.keyword)) continue;
    negativeHitsSet.add(rule.keyword);
    negativeWeight += rule.weight;
  }

  // 4) exclude — 단 1건이라도 매칭되면 후보 제외.
  let excluded = false;
  let excludeReason: string | undefined;
  for (const rule of KEYWORD_RULES) {
    if (rule.type !== "exclude") continue;
    if (!findHit(fullText, rule.keyword)) continue;
    excluded = true;
    excludeReason = rule.keyword;
    break;
  }

  const products = PRODUCT_KEYS.filter((p) => (productScores[p] ?? 0) >= 1).sort(
    (a, b) => (productScores[b] ?? 0) - (productScores[a] ?? 0),
  );
  const primaryProduct = products[0] ?? null;

  // hits Set → array 로 변환.
  const productHitsOut: Partial<Record<ProductKey, string[]>> = {};
  for (const p of PRODUCT_KEYS) {
    const set = productHits[p];
    if (set && set.size > 0) productHitsOut[p] = [...set];
  }

  const reasonParts = products.map((p) => `${p}(${productScores[p] ?? 0})`);
  if (negativeWeight > 0) reasonParts.push(`negative(${negativeWeight})`);
  if (excluded) reasonParts.push(`excluded(${excludeReason})`);

  return {
    products,
    primaryProduct,
    productScores,
    productHits: productHitsOut,
    matchedKeywords: [...allMatched],
    negativeWeight,
    negativeHits: [...negativeHitsSet],
    excluded,
    excludeReason,
    matchReason: reasonParts.join(" · "),
  };
}
