import type { DashboardSummaryCounts } from "@/lib/noticeVisibility";

type SummaryCardsProps = DashboardSummaryCounts;

const items: Array<{
  key: keyof DashboardSummaryCounts;
  label: string;
  /** 라이트/다크 둘 다에서 가독성을 보장하는 dot 색. */
  dot: string;
  accent: string;
}> = [
  {
    key: "activeTotal",
    label: "진행 중 공고",
    dot: "bg-blue-500 dark:bg-blue-400",
    accent: "text-blue-600 dark:text-blue-300",
  },
  {
    key: "contrabass",
    label: "CONTRABASS",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    accent: "text-indigo-600 dark:text-indigo-300",
  },
  {
    key: "viola",
    label: "VIOLA",
    dot: "bg-cyan-500 dark:bg-cyan-400",
    accent: "text-cyan-600 dark:text-cyan-300",
  },
];

/**
 * 첫 화면에서 공고 목록 노출을 빠르게 하기 위해 큰 카드 → 가로 인라인 지표로 축소.
 * 한 줄에 3개 지표가 들어가고, 모바일에서도 같은 레이아웃을 유지한다.
 */
export default function SummaryCards(props: SummaryCardsProps) {
  return (
    <section
      aria-label="요약 지표"
      className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:backdrop-blur-sm sm:px-4 sm:py-2.5 sm:text-[13px]"
    >
      {items.map((item, idx) => (
        <div key={item.key} className="flex items-center gap-2">
          {idx > 0 && (
            <span aria-hidden className="hidden h-3 w-px bg-slate-200 dark:bg-white/10 sm:inline-block" />
          )}
          <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${item.dot}`} />
          <span className="text-slate-500 dark:text-slate-400">{item.label}</span>
          <span className={`font-bold tabular-nums ${item.accent}`}>
            {props[item.key]}
          </span>
        </div>
      ))}
    </section>
  );
}
