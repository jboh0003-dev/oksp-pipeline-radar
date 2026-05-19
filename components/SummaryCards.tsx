type SummaryCardsProps = {
  totalCount: number;
  recommendedCount: number;
  reviewCount: number;
  watchCount: number;
};

const cards: Array<{
  key: string;
  label: string;
  accent: string;
  bg: string;
  getValue: (props: SummaryCardsProps) => number;
}> = [
  {
    key: "total",
    label: "전체 후보",
    accent: "text-[#3182F6]",
    bg: "bg-[#E8F3FF]",
    getValue: (p) => p.totalCount,
  },
  {
    key: "recommended",
    label: "추천 공고",
    accent: "text-[#1B64DA]",
    bg: "bg-[#E8F3FF]",
    getValue: (p) => p.recommendedCount,
  },
  {
    key: "review",
    label: "검토 공고",
    accent: "text-[#E68600]",
    bg: "bg-[#FFF4E0]",
    getValue: (p) => p.reviewCount,
  },
  {
    key: "watch",
    label: "관찰 공고",
    accent: "text-[#6B7684]",
    bg: "bg-[#F2F4F6]",
    getValue: (p) => p.watchCount,
  },
];

export default function SummaryCards(props: SummaryCardsProps) {
  return (
    <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-[#E5E8EB] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5"
        >
          <p className="text-xs font-medium text-[#8B95A1] sm:text-sm">{card.label}</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${card.accent}`}>
            {card.getValue(props)}
          </p>
          <div className={`mt-3 h-1 w-10 rounded-full ${card.bg}`} aria-hidden />
        </div>
      ))}
    </section>
  );
}
