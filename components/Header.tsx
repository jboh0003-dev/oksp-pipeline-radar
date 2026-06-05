import ThemeToggle from "./ThemeToggle";

type HeaderProps = {
  totalCount: number;
  filteredCount: number;
};

/**
 * 첫 화면에서 공고 목록이 더 빨리 눈에 들어오도록 헤더 세로 높이를 압축한다.
 * - 서비스명 + 제목을 한 줄에 배치 ("OKSP Pipeline Radar · 조달 공고 대시보드")
 * - 설명 문구는 한 줄로 줄여 description meta 만 유지
 * - 우측에 표시 중 / 전체 카운트와 테마 토글
 */
export default function Header({ totalCount, filteredCount }: HeaderProps) {
  return (
    <header className="relative mb-3 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/60 sm:px-5 sm:py-3.5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-gradient-to-b from-blue-100/60 via-transparent to-transparent dark:from-blue-500/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-0 h-28 w-28 rounded-full bg-cyan-200/30 blur-3xl dark:bg-cyan-500/10"
      />

      <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400 sm:text-[11px]">
              OKSP Pipeline Radar
            </span>
            <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-lg">
              조달 공고 대시보드
            </h1>
          </div>
          <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
            공공기관 조달 공고를 제품·고객사 기준으로 자동 매핑.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-1.5 text-xs dark:border-blue-400/20 dark:bg-blue-500/10 sm:text-sm">
            <span className="text-slate-500 dark:text-slate-400">표시</span>
            <span className="font-bold text-blue-600 dark:text-blue-300">
              {filteredCount}
            </span>
            <span className="text-slate-400 dark:text-slate-500">/ {totalCount}</span>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
