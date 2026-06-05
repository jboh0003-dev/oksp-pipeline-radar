/**
 * 첫 로딩 동안 표시되는 풀 스켈레톤.
 *
 * 구성: Header / 자동수집 / 요약 카드 / 검색 필터 / 테이블 row(8) / 모바일 카드(2)
 *
 * 톤은 라이트/다크 모두 무채색 + blue/cyan 포인트로 통일하고,
 * 너무 화려한 애니메이션은 피해 업무용 대시보드 느낌을 유지한다.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy aria-live="polite">
      <span className="sr-only">대시보드를 불러오는 중입니다.</span>

      {/* 1. Header skeleton */}
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-4 dark:border-white/10 dark:bg-slate-900/60 sm:px-7 sm:py-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-blue-100/70 via-transparent to-transparent dark:from-blue-500/15"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 top-0 h-48 w-48 rounded-full bg-cyan-200/40 blur-3xl dark:bg-cyan-500/10"
        />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-200 to-indigo-200 dark:from-blue-500/40 dark:to-indigo-500/40" />
            <div
              aria-hidden
              className="hidden h-10 w-px bg-slate-200 dark:bg-white/10 sm:block"
            />
            <div className="space-y-2">
              <Bar w="w-28" />
              <Bar w="w-44" h="h-5" />
              <Bar w="w-56 hidden sm:block" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 rounded-xl bg-blue-100/80 dark:bg-blue-500/15" />
            <div className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-700/40" />
          </div>
        </div>
      </div>

      {/* 2. 자동수집 한 줄 skeleton */}
      <div className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900/70 sm:px-5 sm:py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <Pill w="w-24" tone="blue" />
          <Pill w="w-12" tone="emerald" />
          <Bar w="w-24" />
          <Divider />
          <Bar w="w-16" />
          <Bar w="w-16" />
          <Bar w="w-16" />
        </div>
      </div>

      {/* 3. 요약 카드 3개 skeleton */}
      <div className="mb-4 grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          { iconTone: "bg-blue-100 dark:bg-blue-500/15", barTone: "from-blue-300/70" },
          { iconTone: "bg-indigo-100 dark:bg-indigo-500/15", barTone: "from-indigo-300/70" },
          { iconTone: "bg-cyan-100 dark:bg-cyan-500/15", barTone: "from-cyan-300/70" },
        ].map((item, idx) => (
          <div
            key={idx}
            className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-slate-900/70 sm:px-4 sm:py-3.5"
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r ${item.barTone} to-transparent`}
            />
            <div className="flex items-center gap-3">
              <div className={`h-9 w-9 rounded-xl ${item.iconTone}`} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bar w="w-20" />
                <Bar w="w-12" h="h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 4. 검색/필터 바 skeleton */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-white/10 dark:bg-slate-900/70 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
          <div className="h-11 flex-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 lg:max-w-md" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-9 w-24 rounded-full bg-slate-100 dark:bg-slate-800/60" />
            <Divider tall />
            <div className="h-9 w-16 rounded-full bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-9 w-24 rounded-full bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-9 w-20 rounded-full bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-9 w-24 rounded-lg bg-blue-50 ring-1 ring-blue-100 dark:bg-slate-800/60 dark:ring-blue-400/20" />
          </div>
        </div>
      </div>

      {/* 5a. PC 테이블 skeleton (8 rows) */}
      <div className="hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/60 md:block">
        <div className="grid grid-cols-[7%_7%_8%_28%_18%_8%_7%_7%_5%_5%] gap-x-3 border-b border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-white/10 dark:bg-slate-800/60">
          {Array.from({ length: 10 }).map((_, idx) => (
            <Bar key={idx} w="w-16" h="h-3" />
          ))}
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {Array.from({ length: 8 }).map((_, rowIdx) => (
            <div
              key={rowIdx}
              className="grid grid-cols-[7%_7%_8%_28%_18%_8%_7%_7%_5%_5%] items-start gap-x-3 px-3 py-3.5"
            >
              <Pill w="w-14" tone={rowIdx % 4 === 0 ? "rose" : "emerald"} />
              <Pill w="w-14" tone="blue" />
              <Pill w="w-16" tone="indigo" />
              <div className="space-y-2">
                <Bar w="w-full" h="h-3.5" />
                <Bar w="w-3/4" h="h-3" />
                <div className="flex flex-wrap gap-1">
                  <Pill w="w-10" tone="slate" />
                  <Pill w="w-12" tone="slate" />
                  <Pill w="w-8" tone="slate" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Bar w="w-full" />
                <Bar w="w-1/2" />
              </div>
              <Bar w="w-16" />
              <Pill w="w-14" tone={rowIdx % 3 === 0 ? "emerald" : "slate"} />
              <Bar w="w-12" />
              <Bar w="w-14" />
              <Bar w="w-14" />
            </div>
          ))}
        </div>
      </div>

      {/* 5b. 모바일 카드 skeleton (2 cards) */}
      <div className="space-y-4 md:hidden">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900/70"
          >
            <div className="flex flex-wrap gap-2">
              <Pill w="w-14" tone="emerald" />
              <Pill w="w-14" tone="blue" />
              <Pill w="w-16" tone="slate" />
            </div>
            <div className="mt-4 space-y-2">
              <Bar w="w-3/4" h="h-4" />
              <Bar w="w-1/2" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800/40" />
              <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800/40" />
            </div>
            <div className="mt-4 flex gap-2">
              <Pill w="w-16" tone="indigo" />
              <Pill w="w-14" tone="slate" />
              <Pill w="w-12" tone="slate" />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
        공고 데이터를 불러오는 중입니다…
      </p>
    </div>
  );
}

function Bar({ w, h = "h-3" }: { w: string; h?: string }) {
  return <div className={`${h} ${w} rounded bg-slate-200 dark:bg-slate-700/50`} />;
}

type PillTone = "slate" | "blue" | "indigo" | "cyan" | "emerald" | "rose";

const PILL_TONES: Record<PillTone, string> = {
  slate: "bg-slate-200 dark:bg-slate-700/50",
  blue: "bg-blue-100 dark:bg-blue-500/20",
  indigo: "bg-indigo-100 dark:bg-indigo-500/20",
  cyan: "bg-cyan-100 dark:bg-cyan-500/20",
  emerald: "bg-emerald-100 dark:bg-emerald-500/20",
  rose: "bg-rose-100 dark:bg-rose-500/20",
};

function Pill({ w, tone = "slate" }: { w: string; tone?: PillTone }) {
  return <div className={`h-5 ${w} rounded-full ${PILL_TONES[tone]}`} />;
}

function Divider({ tall = false }: { tall?: boolean }) {
  return (
    <span
      aria-hidden
      className={`hidden ${tall ? "h-6" : "h-3.5"} w-px bg-slate-200 dark:bg-white/10 lg:inline-block`}
    />
  );
}
