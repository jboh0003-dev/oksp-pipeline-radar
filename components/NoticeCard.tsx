import type { Notice } from "@/data/sampleNotices";
import {
  getFitLevel,
  getFitLevelStyle,
  isDeadlineImminent,
} from "@/lib/noticeUtils";

type NoticeCardProps = {
  notice: Notice;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
};

export default function NoticeCard({ notice, isSaved, onToggleSave }: NoticeCardProps) {
  const fitLevel = getFitLevel(notice.fitScore);
  const fitStyle = getFitLevelStyle(fitLevel);
  const imminent = isDeadlineImminent(notice.deadline);

  return (
    <article className="rounded-2xl border border-[#E5E8EB] bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${fitStyle.badge}`}
        >
          {"\uC801\uD569\uB3C4"} {fitLevel}
        </span>
        <span className="rounded-full bg-[#F2F4F6] px-2.5 py-1 text-xs font-semibold text-[#4E5968]">
          {notice.fitScore}
          {"\uC810"}
        </span>
        {imminent && (
          <span className="inline-flex items-center rounded-full bg-[#FFF0F0] px-2.5 py-1 text-xs font-semibold text-[#F04452] ring-1 ring-inset ring-[#FFD6D6]">
            {"\uB9C8\uAC10 \uC784\uBC15"}
          </span>
        )}
      </div>

      <div className="mt-4 sm:mt-5">
        <h2 className="text-base font-bold leading-snug text-[#191F28] sm:text-lg">
          {notice.title}
        </h2>
        <p className="mt-2 text-sm font-medium text-[#6B7684]">{notice.agency}</p>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-4 text-sm min-[480px]:grid-cols-2 sm:gap-5">
        <div className="rounded-xl bg-[#F9FAFB] px-4 py-3.5">
          <dt className="text-xs text-[#8B95A1]">{"\uB9C8\uAC10\uC77C"}</dt>
          <dd className="mt-1 font-semibold text-[#191F28]">{notice.deadline}</dd>
        </div>
        <div className="rounded-xl bg-[#F9FAFB] px-4 py-3.5">
          <dt className="text-xs text-[#8B95A1]">{"\uC608\uC0B0"}</dt>
          <dd className="mt-1 font-semibold text-[#191F28]">{notice.budget}</dd>
        </div>
        <div className="rounded-xl bg-[#F9FAFB] px-4 py-3.5 min-[480px]:col-span-2">
          <dt className="text-xs text-[#8B95A1]">{"\uAD00\uB828 \uC81C\uD488"}</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {notice.relatedProducts.map((product) => (
              <span
                key={product}
                className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-[#4E5968] ring-1 ring-[#E5E8EB]"
              >
                {product}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-[#8B95A1]">{"\uC801\uD569\uB3C4 \uC810\uC218"}</p>
          <span className="text-xs font-semibold text-[#4E5968]">{notice.fitScore} / 100</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#F2F4F6]">
          <div
            className={`h-full rounded-full ${fitStyle.bar}`}
            style={{ width: `${notice.fitScore}%` }}
          />
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs text-[#8B95A1]">{"\uD0A4\uC6CC\uB4DC"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {notice.keywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded-full bg-[#E8F3FF] px-3 py-1 text-xs font-medium text-[#1B64DA]"
            >
              #{keyword}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <a
          href={notice.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#3182F6] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1B64DA] active:scale-[0.99]"
        >
          {"\uC6D0\uBB38 \uBCF4\uAE30"}
        </a>
        <button
          type="button"
          onClick={() => onToggleSave(notice.id)}
          className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-3.5 text-sm font-semibold transition active:scale-[0.99] ${
            isSaved
              ? "bg-[#FFF0F0] text-[#F04452] ring-1 ring-[#FFD6D6]"
              : "bg-[#F2F4F6] text-[#4E5968] hover:bg-[#E5E8EB]"
          }`}
        >
          <HeartIcon filled={isSaved} />
          {isSaved ? "\uAD00\uC2EC \uC800\uC7A5\uB428" : "\uAD00\uC2EC \uC800\uC7A5"}
        </button>
      </div>
    </article>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M12 21s-7-4.35-9.33-8.1C.74 9.74 2.5 5.5 6.5 5.5c2 0 3.2 1.2 3.8 2.2.6-1 1.8-2.2 3.8-2.2 4 0 5.76 4.24 3.83 7.4C19 16.65 12 21 12 21z" />
    </svg>
  );
}
