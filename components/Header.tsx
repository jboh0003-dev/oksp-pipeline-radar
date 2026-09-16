import OkestroWordmark from "./OkestroWordmark";

type HeaderProps = {
  /**
   * 진행중(마감 제외) 공고 수.
   * (호환을 위해 prop 이름은 matchedCount 로 유지하되, 실제로는 진행중 카운트가 들어온다.)
   */
  matchedCount: number;
  /**
   * 현재 화면 필터/검색 적용 후 페이지에서 보고 있는 건수.
   * 우측 칩에는 더 이상 노출하지 않는다 — 페이지 상단의 "표출" 라인에서만 표시.
   * (호환을 위해 prop 은 그대로 유지.)
   */
  filteredCount?: number;
  /** 캐시 hit 여부 — true 면 우상단 칩에 작은 "cache" 배지 표시. */
  fromCache?: boolean;
};

export default function Header({ matchedCount, fromCache }: HeaderProps) {
  return (
    <header className="relative mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-md csg2b-header-bg dark:ring-white/10">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-indigo-400/15 blur-3xl"
      />

      <div className="relative flex min-h-[150px] flex-wrap items-center justify-between gap-x-5 gap-y-3 px-5 py-7 sm:min-h-[190px] sm:px-7 sm:py-9">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <OkestroWordmark />
          <div
            aria-hidden
            className="hidden h-10 w-px bg-gradient-to-b from-transparent via-white/30 to-transparent sm:block"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90 sm:text-[11px]">
              Pipeline Maker
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">
              나라장터
            </h1>
            <p className="mt-1 hidden text-xs text-slate-200/85 sm:block">
              공고 탐색부터 영업기회 발굴까지 · 고객사·담당본부 기준 자동 매칭
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pr-24 sm:pr-28">
          <div className="inline-flex flex-col items-end gap-0.5 rounded-xl border border-white/20 bg-white/15 px-3 py-1.5 text-white shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm">
              <span className="text-slate-100/80">진행중</span>
              <span className="font-bold tabular-nums text-white">
                {matchedCount.toLocaleString("ko-KR")}
              </span>
              <span className="text-slate-200/70">건</span>
            </div>
            <p className="hidden text-[10px] text-slate-200/70 sm:block">
              현재 진행중 공고 기준
              {fromCache && (
                <span className="ml-1.5 rounded-full bg-cyan-400/30 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-cyan-50">
                  cache
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
