type SummaryCardsProps = {
  totalCount: number;
  savedCount: number;
  averageFitScore: number;
  imminentCount: number;
};

const cards = [
  { key: "total", label: "전체 공고", accent: "text-[#3182F6]", bg: "bg-[#E8F3FF]" },
  { key: "saved", label: "관심 공고", accent: "text-[#F04452]", bg: "bg-[#FFF0F0]" },
  { key: "avg", label: "평균 적합도", accent: "text-[#00A661]", bg: "bg-[#E8FAF0]" },
  { key: "urgent", label: "마감 임박", accent: "text-[#E68600]", bg: "bg-[#FFF4E0]" },
] as const;

export default function SummaryCards({
  totalCount,
  savedCount,
  averageFitScore,
  imminentCount,
}: SummaryCardsProps) {
  const values = [totalCount, savedCount, `${averageFitScore}점`, imminentCount];

  return (
    <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {cards.map((card, index) => (
        <div
          key={card.key}
          className="rounded-2xl border border-[#E5E8EB] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5"
        >
          <p className="text-xs font-medium text-[#8B95A1] sm:text-sm">{card.label}</p>
          <p
            className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${card.accent}`}
          >
            {values[index]}
          </p>
          <div className={`mt-3 h-1 w-10 rounded-full ${card.bg}`} aria-hidden />
        </div>
      ))}
    </section>
  );
}
