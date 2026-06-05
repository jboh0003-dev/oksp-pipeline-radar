/**
 * 매칭 등급(내부). 점수/감점 로직 등 내부 분류는 4단계로 유지한다.
 *
 * - 핵심검토: CONTRABASS / VIOLA 영업기회 가능성이 매우 높음. 우선 검토.
 * - 검토:    영업기회 가능성이 있으나 추가 확인 필요.
 * - 참고:    관련은 있지만 우선순위가 낮음. 모니터링용.
 * - 제외후보: 하드웨어 납품 / 단순 구매 성격이 강해 영업 적합도 낮음.
 *             단, 화면에는 노출하지 않고 "참고" 로 통합 표시한다.
 *             ({@link toDisplayMatchGrade} 참조)
 */
export type MatchGrade = "핵심검토" | "검토" | "참고" | "제외후보";

/**
 * 화면 표시용 등급. 사용자가 직관적으로 받아들일 수 있는 3단계만 노출한다.
 * 내부 "제외후보" 는 화면에서는 "참고" 와 같은 칸에 표시된다.
 */
export type DisplayMatchGrade = "핵심검토" | "검토" | "참고";

/** 내부 4단계 등급 → 화면용 3단계 등급 매핑. */
export function toDisplayMatchGrade(grade: MatchGrade): DisplayMatchGrade {
  return grade === "제외후보" ? "참고" : grade;
}

const GRADE_ORDER: Record<MatchGrade, number> = {
  핵심검토: 0,
  검토: 1,
  참고: 2,
  제외후보: 3,
};

/**
 * 점수 → 기본 등급. (negative 신호가 없을 때 사용하는 base grade)
 *
 * 임계값은 기존 점수 분포에 맞춰 다음과 같이 잡는다.
 *  - 70 이상: 핵심검토
 *  - 40 이상: 검토
 *  - 그 외:   참고
 *
 * negative 신호가 있을 경우는 evaluateMatchGrade(score, negativeWeight) 를 사용한다.
 */
export function getMatchGrade(score: number): MatchGrade {
  if (score >= 70) return "핵심검토";
  if (score >= 40) return "검토";
  return "참고";
}

/**
 * 점수 + 하드웨어/납품성 negative weight 를 모두 반영한 최종 등급 결정.
 *
 * weight 합계 의미:
 *  - 3 이상: 즉시 "제외후보"
 *  - 2:      두 단계 다운그레이드 (핵심검토→참고, 검토→참고)
 *  - 1:      한 단계 다운그레이드 (핵심검토→검토, 검토→참고)
 *  - 0:      base grade 유지
 */
export function evaluateMatchGrade(score: number, negativeWeight: number): MatchGrade {
  if (negativeWeight >= 3) return "제외후보";

  const base = getMatchGrade(score);

  if (negativeWeight >= 2) {
    if (base === "핵심검토") return "참고";
    if (base === "검토") return "참고";
    return base;
  }

  if (negativeWeight >= 1) {
    if (base === "핵심검토") return "검토";
    if (base === "검토") return "참고";
    return base;
  }

  return base;
}

export function compareMatchGrade(a: MatchGrade, b: MatchGrade): number {
  return GRADE_ORDER[a] - GRADE_ORDER[b];
}

export function getMatchGradeStyle(grade: MatchGrade) {
  switch (grade) {
    case "핵심검토":
      return {
        // 강조 - 진한 파랑
        badge: "bg-[#E8F3FF] text-[#1B64DA] ring-[#C9E2FF]",
        bar: "bg-[#3182F6]",
      };
    case "검토":
      return {
        // 노랑 — 추가 확인 필요
        badge: "bg-[#FFF4E0] text-[#E68600] ring-[#FFE0A3]",
        bar: "bg-[#FFB020]",
      };
    case "참고":
      return {
        // 회색 — 우선순위 낮음
        badge: "bg-[#F2F4F6] text-[#6B7684] ring-[#E5E8EB]",
        bar: "bg-[#ADB5BD]",
      };
    case "제외후보":
      return {
        // 빨강톤 — 영업 적합도 낮음
        badge: "bg-[#FFEBEB] text-[#C92A2A] ring-[#FFC9C9]",
        bar: "bg-[#C92A2A]",
      };
  }
}
