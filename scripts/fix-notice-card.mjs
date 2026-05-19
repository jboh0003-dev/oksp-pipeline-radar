import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, "..", "components", "NoticeCard.tsx");

const content = `import type { Notice } from "@/data/sampleNotices";
import { getMatchGradeStyle } from "@/lib/noticeGrades";
import { hasReopenKeyword, isPastDueDate } from "@/lib/noticeVisibility";

type NoticeCardProps = {
  notice: Notice;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
};

export default function NoticeCard({ notice, isSaved, onToggleSave }: NoticeCardProps) {
  const gradeStyle = getMatchGradeStyle(notice.matchGrade);
  const isExpired = isPastDueDate(notice.deadline);
  const isReopen = isExpired && hasReopenKeyword(\`\${notice.title} \${notice.summary ?? ""}\`);

  return (
    <article className="rounded-2xl border border-[#E5E8EB] bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={\`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset \${gradeStyle.badge}\`}
        >
          {notice.matchGrade}
        </span>
        <span className="rounded-full bg-[#F2F4F6] px-2.5 py-1 text-xs font-semibold text-[#4E5968]">
          {notice.fitScore}점
        </span>
        {isReopen && (
          <span className="inline-flex items-center rounded-full bg-[#FFF4E0] px-2.5 py-1 text-xs font-semibold text-[#E68600] ring-1 ring-inset ring-[#FFE0A3]">
            재공고·연장
          </span>
        )}
        {!isReopen && isExpired && (
          <span className="inline-flex items-center rounded-full bg-[#FFF0F0] px-2.5 py-1 text-xs font-semibold text-[#F04452] ring-1 ring-inset ring-[#FFD6D6]">
            마감 지남
          </span>
        )}
      </div>

      <div className="mt-4 sm:mt-5">
        <h2 className="text-base font-bold leading-snug text-[#191F28] sm:text-lg">
          {notice.title}
        </h2>
        <p className="mt-1.5 text-sm text-[#6B7684]">{notice.agency}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {notice.relatedProducts.map((product) => (
          <span
            key={product}
            className="rounded-lg bg-[#E8F3FF] px-2.5 py-1 text-xs font-medium text-[#1B64DA]"
          >
            {product}
          </span>
        ))}
      </div>

      {notice.keywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {notice.keywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded-md bg-[#F2F4F6] px-2 py-0.5 text-xs text-[#4E5968]"
            >
              {keyword}
            </span>
          ))}
        </div>
      )}

      {notice.summary && (
        <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-[#4E5968]">
          {notice.summary}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-[#F2F4F6] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-[#6B7684]">
          <span>
            마감 <span className="font-semibold text-[#191F28]">{notice.deadline}</span>
          </span>
          <span className="hidden text-[#E5E8EB] sm:inline" aria-hidden>
            |
          </span>
          <span>
            예산{" "}
            <span className="font-semibold text-[#191F28]">
              {notice.budget > 0 ? formatBudget(notice.budget) : "미공개"}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={notice.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-[#3182F6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1B64DA] active:scale-[0.98]"
          >
            공고 보기
          </a>
          <button
            type="button"
            onClick={() => onToggleSave(notice.id)}
            className={\`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] \${
              isSaved
                ? "bg-[#FFF4E0] text-[#E68600] ring-1 ring-[#FFE0A3]"
                : "bg-white text-[#4E5968] ring-1 ring-[#E5E8EB] hover:bg-[#F9FAFB]"
            }\`}
          >
            {isSaved ? "관심 해제" : "관심 저장"}
          </button>
        </div>
      </div>
    </article>
  );
}

function formatBudget(amount: number): string {
  if (amount >= 100_000_000) {
    const eok = amount / 100_000_000;
    return eok >= 10 ? \`\${Math.round(eok)}억원\` : \`\${eok.toFixed(1)}억원\`;
  }
  if (amount >= 10_000) {
    return \`\${Math.round(amount / 10_000)}만원\`;
  }
  return \`\${amount.toLocaleString("ko-KR")}원\`;
}
`;

writeFileSync(path, content, "utf8");
console.log("Wrote", path);
