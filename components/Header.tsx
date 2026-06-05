import ThemeToggle from "./ThemeToggle";

type HeaderProps = {
  totalCount: number;
  filteredCount: number;
};

/**
 * 좌측: OKESTRO 텍스트 워드마크 + 작은 서비스명(OKSP PIPELINE RADAR) + 메인 제목 + 설명.
 * 우측: 표시 중 카운트 칩 + 라이트/다크 토글.
 *
 * 첫 화면에 공고 테이블이 보이도록 너무 키우지는 않고, 그렇다고 한 줄로 납작하게
 * 압축하지도 않는다. (대략 px-5 sm:px-7 / py-4 sm:py-5)
 */
export default function Header({ totalCount, filteredCount }: HeaderProps) {
  return (
    <header className="relative mb-4 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-4 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/60 sm:px-7 sm:py-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-blue-100/70 via-transparent to-transparent dark:from-blue-500/15"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-0 h-48 w-48 rounded-full bg-cyan-200/50 blur-3xl dark:bg-cyan-500/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -bottom-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10"
      />

      <div className="relative flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Wordmark />
          <div
            aria-hidden
            className="hidden h-10 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent dark:via-white/15 sm:block"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 sm:text-[11px]">
              OKSP Pipeline Radar
            </p>
            <h1 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-xl">
              조달 공고 대시보드
            </h1>
            <p className="mt-0.5 hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
              공공기관 조달 공고를 제품·고객사 기준으로 자동 매핑.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-1.5 text-xs shadow-sm dark:border-blue-400/20 dark:bg-blue-500/10 sm:text-sm">
            <span className="text-slate-500 dark:text-slate-400">표시 중</span>
            <span className="font-bold text-blue-600 dark:text-blue-300">
              {filteredCount}
            </span>
            <span className="text-slate-400 dark:text-slate-500">/ {totalCount}건</span>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/**
 * OKESTRO 텍스트 워드마크.
 * public/ 에 로고 파일이 없어서 텍스트 + 그라데이션 + 작은 dot 으로 브랜드감만 표현한다.
 * 추후 실제 로고 SVG 가 추가되면 이 컴포넌트만 바꾸면 된다.
 */
function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 shadow-md ring-1 ring-inset ring-white/20 dark:from-blue-400 dark:via-blue-500 dark:to-indigo-500"
      >
        <span className="text-sm font-black tracking-tight text-white">O</span>
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-cyan-300 ring-2 ring-white dark:ring-slate-900"
        />
      </span>
      <span className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-base font-extrabold tracking-tight text-transparent dark:from-slate-50 dark:to-slate-300 sm:text-lg">
        OKESTRO
      </span>
    </div>
  );
}
