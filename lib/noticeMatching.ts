import { NEGATIVE_KEYWORDS } from "@/lib/g2b/constants";

export type NegativeMatchResult = {
  /** 누적 weight. 0 이면 negative 신호 없음. */
  weight: number;
  /** 실제 매칭된 negative 키워드 목록 (중복 제거). */
  hits: string[];
};

/**
 * 공고 텍스트에서 하드웨어 납품 / 단순 구매 / 단순 유지보수 시그널을 찾는다.
 * 점수 자체는 변경하지 않고, 추천 등급을 다운그레이드 / "제외후보" 분류할 때 사용한다.
 *
 * 한국어 substring 매칭은 단어 경계 없이도 충분히 정확.
 *  - "서버 가상화 구매" 는 "서버 구매" 와 substring 으로 매칭되지 않으므로 안전.
 *  - "서버" 단독 단어는 NEGATIVE_KEYWORDS 에 의도적으로 포함시키지 않았다.
 */
export function detectNegativeSignals(text: string | null | undefined): NegativeMatchResult {
  const haystack = (text ?? "").toLowerCase();
  if (!haystack) return { weight: 0, hits: [] };

  const seen = new Set<string>();
  let weight = 0;

  for (const { keyword, weight: kwWeight } of NEGATIVE_KEYWORDS) {
    const needle = keyword.toLowerCase();
    if (!haystack.includes(needle)) continue;
    if (seen.has(keyword)) continue;
    seen.add(keyword);
    weight += kwWeight;
  }

  return { weight, hits: [...seen] };
}

/**
 * Notice 또는 NoticeRow 에 들어 있는 텍스트들을 모아 하나의 검색 텍스트로 만든다.
 * - title, agency, summary, keywords 는 거의 항상 존재
 * - rawData 는 있을 수도 / 없을 수도 있어 optional
 */
export function buildNegativeSearchText(input: {
  title?: string | null;
  agency?: string | null;
  summary?: string | null;
  keywords?: string[] | null;
  rawData?: string | null;
}): string {
  return [
    input.title ?? "",
    input.agency ?? "",
    input.summary ?? "",
    ...(input.keywords ?? []),
    input.rawData ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}
