import {
  EXCLUDE_KEYWORDS,
  GENERAL_IT_KEYWORDS,
  MATCH_SCORE_THRESHOLD,
  PRODUCT_KEYWORD_TIERS,
} from "@/lib/g2b/constants";
import {
  buildG2bRawTextPreview,
  getG2bAgency,
  getG2bField,
  getG2bTitle,
  TITLE_FIELD_CANDIDATES,
} from "@/lib/g2b/fields";
import { getMatchGrade, type MatchGrade } from "@/lib/noticeGrades";

export type NoticeMatch = {
  products: string[];
  keywords: string[];
  matchScore: number;
  matchGrade: MatchGrade;
  summary: string;
  hasProductKeywordHit: boolean;
};

export type UnmatchedSample = {
  title: string;
  agency: string;
  rawTextPreview: string;
};

export type ExcludedSample = {
  title: string;
  agency: string;
  rawTextPreview: string;
  excludeReason: string;
};

type HitKind = "product-strong" | "product-weak" | "general";

type MatchHit = {
  product?: string;
  keyword: string;
  kind: HitKind;
  field: "title" | "other";
  points: number;
};

export type G2bEvaluateResult =
  | { status: "matched"; match: NoticeMatch }
  | { status: "excluded"; sample: ExcludedSample }
  | { status: "none" };

const PRODUCT_SCORE = {
  titleStrongBoost: 52,
  titleWeakBoost: 30,
  titleStrong: 42,
  titleWeak: 24,
  otherStrongBoost: 20,
  otherWeakBoost: 12,
  otherStrong: 16,
  otherWeak: 10,
} as const;

const GENERAL_SCORE = {
  title: 14,
  other: 8,
} as const;

function buildSearchTexts(item: Record<string, unknown>) {
  const title = getG2bTitle(item);
  const other = [
    getG2bAgency(item),
    getG2bField(item, ["bsnsNm", "ntceNm"]),
    getG2bField(item, ["prdctNm", "dtlPrdctNm", "prdctClsfcNoNm"]),
    getG2bField(item, ["purchsObjPrdctNm", "purchsObjNm"]),
    getG2bField(item, ["srvceNm", "cnsttyNm"]),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title,
    titleLower: title.toLowerCase(),
    otherLower: other.toLowerCase(),
    fullTextLower: `${title} ${other}`.toLowerCase(),
  };
}

function findExcludeReason(fullTextLower: string): string | null {
  for (const keyword of EXCLUDE_KEYWORDS) {
    if (fullTextLower.includes(keyword.toLowerCase())) {
      return `제외 키워드 "${keyword}" 포함`;
    }
  }
  return null;
}

function includesKeyword(textLower: string, keyword: string): boolean {
  const normalized = keyword.toLowerCase();
  if (normalized === "ai") {
    return /(?:^|[^a-z0-9])ai(?:[^a-z0-9]|$)/i.test(textLower);
  }
  return textLower.includes(normalized);
}

function productPoints(
  tier: "strong" | "weak",
  field: "title" | "other",
  titleBoost: boolean,
): number {
  if (field === "title") {
    if (tier === "strong") {
      return titleBoost ? PRODUCT_SCORE.titleStrongBoost : PRODUCT_SCORE.titleStrong;
    }
    return titleBoost ? PRODUCT_SCORE.titleWeakBoost : PRODUCT_SCORE.titleWeak;
  }
  if (tier === "strong") {
    return titleBoost ? PRODUCT_SCORE.otherStrongBoost : PRODUCT_SCORE.otherStrong;
  }
  return titleBoost ? PRODUCT_SCORE.otherWeakBoost : PRODUCT_SCORE.otherWeak;
}

function buildSummary(
  grade: MatchGrade,
  keywords: string[],
  products: string[],
  hasProductKeywordHit: boolean,
): string {
  const keywordText = keywords.slice(0, 10).join(", ");
  if (hasProductKeywordHit && products.length > 0) {
    return `[${grade}] ${keywordText} 키워드가 포함되어 ${products.join("/")} 검토 가능`;
  }
  return `[${grade}] ${keywordText} 키워드가 포함되어 일반 IT·인프라 후보로 관찰`;
}

export function evaluateG2bItem(item: Record<string, unknown>): G2bEvaluateResult {
  const { title, titleLower, otherLower, fullTextLower } = buildSearchTexts(item);

  const excludeReason = findExcludeReason(fullTextLower);
  if (excludeReason) {
    return {
      status: "excluded",
      sample: {
        title: title || "(제목 없음)",
        agency: getG2bAgency(item),
        rawTextPreview: buildG2bRawTextPreview(item),
        excludeReason,
      },
    };
  }

  const hits: MatchHit[] = [];
  const hitKeys = new Set<string>();

  const addHit = (hit: MatchHit) => {
    const key = `${hit.product ?? "general"}:${hit.keyword}:${hit.field}:${hit.kind}`;
    if (hitKeys.has(key)) return;
    hitKeys.add(key);
    hits.push(hit);
  };

  for (const [product, tier] of Object.entries(PRODUCT_KEYWORD_TIERS)) {
    const tierDefs: Array<{ list: string[]; tierName: "strong" | "weak"; kind: HitKind }> = [
      { list: tier.strong, tierName: "strong", kind: "product-strong" },
      { list: tier.weak, tierName: "weak", kind: "product-weak" },
    ];

    for (const { list, tierName, kind } of tierDefs) {
      for (const keyword of list) {
        const inTitle = includesKeyword(titleLower, keyword);
        const inOther = !inTitle && includesKeyword(otherLower, keyword);
        if (!inTitle && !inOther) continue;

        const field = inTitle ? "title" : "other";
        addHit({
          product,
          keyword,
          kind,
          field,
          points: productPoints(tierName, field, tier.titleBoost ?? false),
        });
      }
    }
  }

  for (const keyword of GENERAL_IT_KEYWORDS) {
    const inTitle = includesKeyword(titleLower, keyword);
    const inOther = !inTitle && includesKeyword(otherLower, keyword);
    if (!inTitle && !inOther) continue;

    addHit({
      keyword,
      kind: "general",
      field: inTitle ? "title" : "other",
      points: inTitle ? GENERAL_SCORE.title : GENERAL_SCORE.other,
    });
  }

  if (hits.length === 0) {
    return { status: "none" };
  }

  const totalScore = Math.min(
    hits.reduce((sum, hit) => sum + hit.points, 0),
    100,
  );

  if (totalScore < MATCH_SCORE_THRESHOLD) {
    return { status: "none" };
  }

  const products = [...new Set(hits.filter((h) => h.product).map((h) => h.product!))];
  const keywords = [...new Set(hits.map((h) => h.keyword))];
  const hasProductKeywordHit = hits.some((h) => h.kind.startsWith("product"));
  const matchGrade = getMatchGrade(totalScore);

  return {
    status: "matched",
    match: {
      products,
      keywords,
      matchScore: totalScore,
      matchGrade,
      hasProductKeywordHit,
      summary: buildSummary(matchGrade, keywords, products, hasProductKeywordHit),
    },
  };
}

export function buildUnmatchedSample(item: Record<string, unknown>): UnmatchedSample {
  return {
    title: getG2bTitle(item) || "(제목 없음)",
    agency: getG2bAgency(item),
    rawTextPreview: buildG2bRawTextPreview(item),
  };
}

export function getExternalId(item: Record<string, unknown>): string | null {
  const bidNtceNo = getG2bField(item, ["bidNtceNo"]);
  const bidNtceOrd = getG2bField(item, ["bidNtceOrd"]) || "0";
  if (!bidNtceNo) return null;
  return `${bidNtceNo}-${bidNtceOrd}`;
}

export { TITLE_FIELD_CANDIDATES };
