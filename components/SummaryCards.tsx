import { formatBudgetKorean, formatBudgetWon } from "@/lib/budget";
import type { DashboardSummaryCounts } from "@/lib/noticeVisibility";

type SummaryCardsProps = DashboardSummaryCounts;

type IconName = "pulse" | "cube" | "stack" | "coin";

type Item = {
  key: keyof DashboardSummaryCounts;
  label: string;
  /** 라이트/다크 양쪽에서 가독성을 보장하는 accent 컬러 그룹. */
  accentText: string;
  iconBg: string;
  iconText: string;
  bar: string;
  icon: IconName;
  /** 표시값 가공. 기본은 그대로 노출. */
  formatValue?: (raw: number) => { value: string; subValue?: string };
};

const items: Item[] = [
  {
    key: "activeTotal",
    label: "진행 중 공고",
    accentText: "text-blue-600 dark:text-blue-300",
    iconBg: "bg-blue-50 ring-blue-100 dark:bg-blue-500/15 dark:ring-blue-400/20",
    iconText: "text-blue-600 dark:text-blue-300",
    bar: "from-blue-500/70 to-blue-400/0 dark:from-blue-400/70",
    icon: "pulse",
  },
  {
    key: "contrabass",
    label: "CONTRABASS",
    accentText: "text-indigo-600 dark:text-indigo-300",
    iconBg: "bg-indigo-50 ring-indigo-100 dark:bg-indigo-500/15 dark:ring-indigo-400/20",
    iconText: "text-indigo-600 dark:text-indigo-300",
    bar: "from-indigo-500/70 to-indigo-400/0 dark:from-indigo-400/70",
    icon: "cube",
  },
  {
    key: "viola",
    label: "VIOLA",
    accentText: "text-cyan-600 dark:text-cyan-300",
    iconBg: "bg-cyan-50 ring-cyan-100 dark:bg-cyan-500/15 dark:ring-cyan-400/20",
    iconText: "text-cyan-600 dark:text-cyan-300",
    bar: "from-cyan-500/70 to-cyan-400/0 dark:from-cyan-400/70",
    icon: "stack",
  },
  {
    key: "totalBudgetWon",
    label: "예산 합계",
    accentText: "text-amber-600 dark:text-amber-300",
    iconBg: "bg-amber-50 ring-amber-100 dark:bg-amber-500/15 dark:ring-amber-400/20",
    iconText: "text-amber-600 dark:text-amber-300",
    bar: "from-amber-500/70 to-amber-400/0 dark:from-amber-400/70",
    icon: "coin",
    formatValue: (raw: number) => {
      if (!raw || raw <= 0) {
        return { value: "—", subValue: "예산 미공개" };
      }
      const won = formatBudgetWon(raw) ?? "—";
      const korean = formatBudgetKorean(raw);
      return { value: won, subValue: korean ?? undefined };
    },
  },
];

/**
 * 4-column 카드: 진행 중 / CONTRABASS / VIOLA / 예산 합계.
 * 예산 합계 카드는 진행 중·제품 매칭된 공고만 합산한다 (countDashboardSummary 기준).
 */
export default function SummaryCards(props: SummaryCardsProps) {
  return (
    <section className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {items.map((item) => {
        const raw = props[item.key];
        const formatted = item.formatValue
          ? item.formatValue(raw)
          : { value: String(raw), subValue: undefined };
        return (
          <div
            key={item.key}
            className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm transition hover:border-blue-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900/70 dark:backdrop-blur-sm dark:hover:border-blue-400/30 sm:px-4 sm:py-3.5"
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r ${item.bar}`}
            />
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${item.iconBg} ${item.iconText}`}
              >
                <Icon name={item.icon} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:text-xs">
                  {item.label}
                </p>
                <p
                  className={`mt-0.5 truncate text-xl font-bold leading-none tracking-tight tabular-nums sm:text-2xl ${item.accentText}`}
                  title={formatted.value}
                >
                  {formatted.value}
                </p>
                {formatted.subValue && (
                  <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {formatted.subValue}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Icon({ name }: { name: IconName }) {
  if (name === "pulse") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 12h3l3-7 4 14 3-7h5" />
      </svg>
    );
  }
  if (name === "cube") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    );
  }
  if (name === "coin") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
        <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      </svg>
    );
  }
  // stack
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  );
}
