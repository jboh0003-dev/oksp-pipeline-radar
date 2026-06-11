import OkestroWordmark from "./OkestroWordmark";
import ThemeToggle from "./ThemeToggle";

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

/**
 * 좌측: OKESTRO 로고(또는 텍스트 워드마크 fallback) + 영문 보조 타이틀(OKESTRO CS-G2B) +
 *        한글 메인 타이틀(나라장터 공고 대시보드) + 부제.
 * 우측: 진행중 카운트 칩(단일 숫자) + 라이트/다크 토글.
 *
 * 디자인 노트:
 *  - 헤더 카드 안에서만 브랜드 배경 이미지(`public/assets/okestro-building.jpg`)를 cover 로
 *    깔고, 그 위에 좌측이 진한 navy → 우측으로 옅어지는 그라데이션 overlay 를 얹어
 *    좌측 텍스트 가독성을 보장한다. 사진이 없을 때도 grad fallback 으로 자연스럽게 보인다.
 *    (csg2b-header-bg 클래스는 globals.css 정의)
 *  - 헤더 높이를 min-h 로 확보해 건물 사진이 브랜딩 배경으로 충분히 느껴지도록 한다.
 *  - 우측 칩은 "표출/매칭" 두 숫자를 보여주던 형태에서 핵심 숫자(진행중 N건) 하나만 보여주는
 *    단순 칩으로 정리했다. 표출 수는 페이지 상단의 stat strip 에서만 노출.
 */
export default function Header({ matchedCount, fromCache }: HeaderProps) {
  return (
    <header className="relative mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-md csg2b-header-bg dark:ring-white/10">
      {/*
        배경 이미지/그라데이션 위에 옅은 noise 같은 미세 글로우를 추가해 너무 단조롭지 않게.
        카드 안에서만 보이도록 absolute + overflow-hidden 으로 가둠.
      */}
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
              OKESTRO CS-G2B
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">
              나라장터 공고 대시보드
            </h1>
            <p className="mt-1 hidden text-xs text-slate-200/85 sm:block">
              공공기관 조달 공고 조회 · 고객사·담당본부 기준 자동 매칭
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/*
            우상단 단일 숫자 칩 — "진행중 N건" 만 노출.
            "표출" 카운트는 페이지 상단의 stat strip 에서만 표시한다 (의미 중복 방지).
          */}
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
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
