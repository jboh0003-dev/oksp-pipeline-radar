import type { DashboardSummaryCounts } from "@/lib/noticeVisibility";

type SummaryCardsProps = DashboardSummaryCounts;

type IconName = "pulse" | "cube" | "stack";

const items: Array<{
  key: keyof DashboardSummaryCounts;
  label: string;
  /** 라이트/다크 양쪽에서 가독성을 보장하는 accent 컬러 그룹. */
  accentText: string;
  iconBg: string;
  iconText: string;
  bar: string;
  icon: IconName;
}> = [
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
];

/**
 * 카운트 정책 (사용자 혼동 방지 — "VIOLA 11→6 으로 줄어든다" 이슈 반영):
 *  - 진행 중 공고: 마감 제외 + announcementKey 로 dedup 한 unique 공고 수.
 *  - CONTRABASS / VIOLA: relatedProducts.includes 기준 — 해당 제품이 매칭에 한 번이라도 잡혀있으면 +1
 *    ("관련 매칭 기준 · 중복 포함"). 두 제품이 모두 매칭된 공고는 양쪽 카드에 모두 +1.
 *  - 그래서 제품별 합계가 전체("진행 중 공고")보다 클 수 있다 → 섹션 하단 안내 문구로 명시.
 *
 * 예산은 별도 합계 카드로 두지 않는다. 공고별 예산은 NoticeTable 의 "예산" 컬럼에서 표시한다.
 */
export default function SummaryCards(props: SummaryCardsProps) {
  return (
    <section className="mb-4">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {items.map((item) => (
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:text-xs">
                  {item.label}
                </p>
                <p
                  className={`mt-0.5 text-xl font-bold leading-none tracking-tight tabular-nums sm:text-2xl ${item.accentText}`}
                >
                  {props[item.key]}
                </p>
                <p className="mt-1 truncate text-[10px] text-slate-400 dark:text-slate-500">
                  {item.key === "activeTotal"
                    ? "진행중 기준"
                    : "관련 매칭 기준 · 중복 포함"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
        제품별 수는 복수 제품 매칭 시 중복 집계됩니다.
      </p>
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
