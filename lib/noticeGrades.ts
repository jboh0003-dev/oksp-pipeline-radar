export type MatchGrade = "추천" | "검토" | "관찰";

const GRADE_ORDER: Record<MatchGrade, number> = {
  추천: 0,
  검토: 1,
  관찰: 2,
};

export function getMatchGrade(score: number): MatchGrade {
  if (score >= 70) return "추천";
  if (score >= 40) return "검토";
  return "관찰";
}

export function compareMatchGrade(a: MatchGrade, b: MatchGrade): number {
  return GRADE_ORDER[a] - GRADE_ORDER[b];
}

export function getMatchGradeStyle(grade: MatchGrade) {
  switch (grade) {
    case "추천":
      return {
        badge: "bg-[#E8F3FF] text-[#1B64DA] ring-[#C9E2FF]",
        bar: "bg-[#3182F6]",
      };
    case "검토":
      return {
        badge: "bg-[#FFF4E0] text-[#E68600] ring-[#FFE0A3]",
        bar: "bg-[#FFB020]",
      };
    case "관찰":
      return {
        badge: "bg-[#F2F4F6] text-[#6B7684] ring-[#E5E8EB]",
        bar: "bg-[#ADB5BD]",
      };
  }
}
