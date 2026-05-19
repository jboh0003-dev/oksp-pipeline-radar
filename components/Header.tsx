type HeaderProps = {
  totalCount: number;
  filteredCount: number;
};

export default function Header({ totalCount, filteredCount }: HeaderProps) {
  return (
    <header className="mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[#3182F6]">OKSP Pipeline Radar</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#191F28] sm:text-3xl">
            조달 공고 대시보드
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6B7684] sm:text-base">
            공공기관 조달 공고를 제품별로 자동 매핑해 한눈에 확인하세요.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start rounded-2xl bg-[#E8F3FF] px-4 py-3 sm:self-auto">
          <span className="text-sm text-[#4E5968]">표시 중</span>
          <span className="text-lg font-bold text-[#3182F6]">{filteredCount}</span>
          <span className="text-sm text-[#8B95A1]">/ {totalCount}건</span>
        </div>
      </div>
    </header>
  );
}
