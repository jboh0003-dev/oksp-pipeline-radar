import { CONTRABASS_FAMILY, type Notice } from "@/data/sampleNotices";
import { formatAccountTypeLabel } from "@/lib/customerMatching";
import { getMatchGradeStyle, toDisplayMatchGrade } from "@/lib/noticeGrades";
import { getDueStatus, type DueStatus } from "@/lib/noticeVisibility";

const dueStatusStyles: Record<DueStatus, { badge: string; deadline: string }> = {
  "진행 중": {
    badge: "bg-[#E8F3FF] text-[#1B64DA] ring-[#C9E2FF]",
    deadline: "text-[#191F28]",
  },
  "마감 지남": {
    badge: "bg-[#F2F4F6] text-[#6B7684] ring-[#E5E8EB]",
    deadline: "text-[#6B7684]",
  },
  "마감일 확인 필요": {
    badge: "bg-[#FFF4E0] text-[#E68600] ring-[#FFE0A3]",
    deadline: "text-[#E68600]",
  },
};

const dueStatusLabels: Record<DueStatus, string> = {
  "진행 중": "진행 중",
  "마감 지남": "마감 지난",
  "마감일 확인 필요": "마감일 확인 필요",
};

const CONTRABASS_FAMILY_SET = new Set<string>(CONTRABASS_FAMILY);

function toDisplayProductLabel(product: string): string | null {
  if (CONTRABASS_FAMILY_SET.has(product)) return "CONTRABASS";
  if (product === "VIOLA") return "VIOLA";
  return null;
}

function dedupeDisplayProducts(products: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const product of products) {
    const label = toDisplayProductLabel(product);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }
  return result;
}

type NoticeCardProps = {
  notice: Notice;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
};

function CustomerInline({
  customer,
  agency,
}: {
  customer: NonNullable<Notice["customer"]>;
  agency: string;
}) {
  const accountLabel = formatAccountTypeLabel(customer.accountType);
  const showName = customer.customerName && customer.customerName !== agency;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
      {customer.territory && (
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#E8F3FF] px-2 py-0.5 font-semibold text-[#1B64DA]">
          {customer.territory}
        </span>
      )}
      {accountLabel === "Named" ? (
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#E5F5EA] px-2 py-0.5 font-bold text-[#1A8245]">
          Named
        </span>
      ) : accountLabel === "Non Named" ? (
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#F2F4F6] px-2 py-0.5 font-semibold text-[#6B7684]">
          Non Named
        </span>
      ) : null}
      {showName && (
        <span
          title={`내부 매칭: ${customer.customerName} (${
            customer.matchType === "exact"
              ? "정확 일치"
              : customer.matchType === "normalized"
                ? "정규화 일치"
                : "포함관계 일치"
          })`}
          className="text-[#3182F6]"
        >
          ↳ {customer.customerName}
        </span>
      )}
    </div>
  );
}

export default function NoticeCard({ notice, isSaved, onToggleSave }: NoticeCardProps) {
  // 화면에는 3단계(핵심검토/검토/참고)만 노출. 내부 "제외후보" 는 "참고" 로 통합 표시.
  const displayGrade = toDisplayMatchGrade(notice.matchGrade);
  const gradeStyle = getMatchGradeStyle(displayGrade);
  const dueStatus = getDueStatus(notice.deadline);
  const statusStyle = dueStatusStyles[dueStatus];
  const dueStatusLabel = dueStatusLabels[dueStatus];
  const budgetLabel =
    notice.budget && notice.budget !== "-" ? notice.budget : "미공개";
  const deadlineLabel =
    dueStatus === "마감일 확인 필요" ? "마감일 확인 필요" : notice.deadline;
  const noticeDateLabel = notice.noticeDate?.trim()
    ? notice.noticeDate
    : "\uAC8C\uC2DC\uC77C \uD655\uC778 \uD544\uC694";
  const hasNoticeDate = Boolean(notice.noticeDate?.trim());
  const displayProducts = dedupeDisplayProducts(notice.relatedProducts);

  return (
    <article
      className={`rounded-2xl border border-[#E5E8EB] bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6 ${
        dueStatus === "마감 지남" ? "opacity-90" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle.badge}`}
        >
          {dueStatusLabel}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${gradeStyle.badge}`}
        >
          {displayGrade}
        </span>
        <span
          title="점수 기반 기본 추천도 (참고용)"
          className="rounded-full bg-[#F9FAFB] px-2 py-1 text-[11px] font-medium text-[#8B95A1] ring-1 ring-inset ring-[#E5E8EB]"
        >
          점수 {notice.fitScore}
        </span>
      </div>

      <div className="mt-4 sm:mt-5">
        <h2 className="text-base font-bold leading-snug text-[#191F28] sm:text-lg">
          {notice.title}
        </h2>
        <p className="mt-1.5 text-sm text-[#6B7684]">{notice.agency}</p>
        {notice.customer && (
          <CustomerInline customer={notice.customer} agency={notice.agency} />
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-md">
        <div className="rounded-xl bg-[#F9FAFB] px-3 py-2.5 ring-1 ring-inset ring-[#F2F4F6]">
          <p className="text-[11px] font-medium text-[#8B95A1]">{"\uAC8C\uC2DC\uC77C"}</p>
          <p
            className={`mt-0.5 text-sm font-semibold ${
              hasNoticeDate ? "text-[#191F28]" : "text-[#E68600]"
            }`}
          >
            {noticeDateLabel}
          </p>
        </div>
        <div className="rounded-xl bg-[#F9FAFB] px-3 py-2.5 ring-1 ring-inset ring-[#F2F4F6]">
          <p className="text-[11px] font-medium text-[#8B95A1]">{"\uB9C8\uAC10\uC77C"}</p>
          <p className={`mt-0.5 text-sm font-semibold ${statusStyle.deadline}`}>
            {deadlineLabel}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {displayProducts.map((product) => (
          <span
            key={product}
            className="rounded-lg bg-[#E8F3FF] px-2.5 py-1 text-xs font-medium text-[#1B64DA]"
          >
            {product}
          </span>
        ))}
      </div>

      {(() => {
        // keywords 가 null/undefined/빈 값이거나 같은 키워드가 중복으로 들어오는 경우를 방어.
        // (예: ["정보시스템", "정보시스템"] → React key 중복 경고)
        const uniqueKeywords = Array.from(
          new Set((notice.keywords ?? []).filter((kw): kw is string => Boolean(kw))),
        );
        if (uniqueKeywords.length === 0) return null;
        return (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {uniqueKeywords.map((keyword, index) => (
              <span
                key={`${keyword}-${index}`}
                className="rounded-md bg-[#F2F4F6] px-2 py-0.5 text-xs text-[#4E5968]"
              >
                {keyword}
              </span>
            ))}
          </div>
        );
      })()}

      {notice.summary && (
        <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-[#4E5968]">
          {notice.summary}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-[#F2F4F6] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-[#6B7684]">
          <span>
            {"\uC608\uC0B0 "}
            <span className="font-semibold text-[#191F28]">{budgetLabel}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={notice.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-[#3182F6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1B64DA] active:scale-[0.98]"
          >
            {"\uACF5\uACE0 \uBCF4\uAE30"}
          </a>
          <button
            type="button"
            onClick={() => onToggleSave(notice.id)}
            className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
              isSaved
                ? "bg-[#FFF4E0] text-[#E68600] ring-1 ring-[#FFE0A3]"
                : "bg-white text-[#4E5968] ring-1 ring-[#E5E8EB] hover:bg-[#F9FAFB]"
            }`}
          >
            {isSaved ? "\uAD00\uC2EC \uD574\uC81C" : "\uAD00\uC2EC \uC800\uC7A5"}
          </button>
        </div>
      </div>
    </article>
  );
}
