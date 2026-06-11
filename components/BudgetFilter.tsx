"use client";

/**
 * 예산(원 단위) 기준 dropdown 필터.
 *  - 전체 / 1억 이상 / 5억 이상 / 10억 이상 / 30억 이상 / 예산 미공개 제외
 *  - 입찰공고와 사전규격공고가 같은 컴포넌트를 사용하도록 budget 숫자값(원) 만 다룬다.
 */

export type BudgetFilterValue =
  | "all"
  | "100m"
  | "500m"
  | "1b"
  | "3b"
  | "exclude-missing";

const OPTIONS: Array<{ value: BudgetFilterValue; label: string }> = [
  { value: "all", label: "예산 · 전체" },
  { value: "100m", label: "1억 이상" },
  { value: "500m", label: "5억 이상" },
  { value: "1b", label: "10억 이상" },
  { value: "3b", label: "30억 이상" },
  { value: "exclude-missing", label: "예산 미공개 제외" },
];

const THRESHOLD_BY_VALUE: Record<BudgetFilterValue, number | "exclude-missing" | "all"> = {
  all: "all",
  "100m": 100_000_000,
  "500m": 500_000_000,
  "1b": 1_000_000_000,
  "3b": 3_000_000_000,
  "exclude-missing": "exclude-missing",
};

/**
 * 한 항목이 budget 필터를 통과하는지.
 *
 *  - all: 항상 통과.
 *  - exclude-missing: budget 이 0/null 이면 제외, 그 외 모두 통과.
 *  - 100m / 500m / 1b / 3b: budget >= threshold 만 통과 (0/null 은 제외).
 */
export function matchesBudgetFilter(
  budget: number | null | undefined,
  value: BudgetFilterValue,
): boolean {
  const threshold = THRESHOLD_BY_VALUE[value];
  if (threshold === "all") return true;
  const amount = typeof budget === "number" && Number.isFinite(budget) && budget > 0 ? budget : 0;
  if (threshold === "exclude-missing") return amount > 0;
  return amount >= threshold;
}

type Props = {
  value: BudgetFilterValue;
  onChange: (next: BudgetFilterValue) => void;
  /** 컴포넌트 disabled 처리 (수집 중 등). */
  disabled?: boolean;
};

export default function BudgetFilter({ value, onChange, disabled }: Props) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">예산 필터</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as BudgetFilterValue)}
        disabled={disabled}
        title="배정/추정 예산 기준 필터"
        className="h-9 cursor-pointer appearance-none whitespace-nowrap rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-blue-400/40 dark:focus:border-blue-400 dark:focus:ring-blue-400/30 sm:text-sm"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2.5 text-[10px] text-slate-400 dark:text-slate-500"
      >
        ▼
      </span>
    </label>
  );
}
