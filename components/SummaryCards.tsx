import type { DashboardSummaryCounts } from "@/lib/noticeVisibility";

type SummaryCardsProps = DashboardSummaryCounts;

const cards: Array<{
  key: keyof DashboardSummaryCounts;
  label: string;
  accent: string;
  bg: string;
}> = [
  {
    key: "activeTotal",
    label: "진행 중 공고",
    accent: "text-[#3182F6]",
    bg: "bg-[#E8F3FF]",
  },
  {
    key: "contrabass",
    label: "CONTRABASS",
    accent: "text-[#1B64DA]",
    bg: "bg-[#E8F3FF]",
  },
  {
    key: "viola",
    label: "VIOLA",
    accent: "text-[#1B64DA]",
    bg: "bg-[#E8F3FF]",
  },
];

export default function SummaryCards(props: SummaryCardsProps) {
  return (
    <section className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-[#E5E8EB] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5"
        >
          <p className="text-xs font-medium text-[#8B95A1] sm:text-sm">{card.label}</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${card.accent}`}>
            {props[card.key]}
          </p>
          <div aria-hidden className={`mt-3 h-1 w-10 rounded-full ${card.bg}`} />
        </div>
      ))}
    </section>
  );
}
