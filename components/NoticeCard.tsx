import { CONTRABASS_FAMILY, type Notice } from "@/data/sampleNotices";
import { getBudgetInfo } from "@/lib/budget";
import { formatAccountTypeLabel } from "@/lib/customerMatching";
import { getMatchGradeStyle, toDisplayMatchGrade } from "@/lib/noticeGrades";
import { getDueStatus, type DueStatus } from "@/lib/noticeVisibility";

const dueStatusStyles: Record<DueStatus, { badge: string; deadline: string }> = {
  "진행 중": {
    badge:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
    deadline: "text-slate-900 dark:text-slate-100",
  },
  "마감 지남": {
    badge:
      "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:ring-white/10",
    deadline: "text-slate-500 dark:text-slate-400",
  },
  "마감일 확인 필요": {
    badge:
      "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
    deadline: "text-amber-700 dark:text-amber-300",
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
  /** 피드백이 등록되어 있는지 — 버튼 색 강조용. */
  hasFeedback?: boolean;
  /** 피드백 모달 열기. 부모가 announcementKey 를 알아내어 처리. */
  onOpenFeedback?: () => void;
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
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
          {customer.territory}
        </span>
      )}
      {accountLabel === "Named" ? (
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          Named
        </span>
      ) : accountLabel === "Non Named" ? (
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 dark:bg-slate-700/40 dark:text-slate-300">
          Non Named
        </span>
      ) : null}
      {showName && (
        <span
          title={`내부 매칭: ${customer.customerName}`}
          className="text-blue-600 dark:text-blue-300"
        >
          ↳ {customer.customerName}
        </span>
      )}
    </div>
  );
}

export default function NoticeCard({
  notice,
  isSaved,
  onToggleSave,
  hasFeedback,
  onOpenFeedback,
}: NoticeCardProps) {
  const displayGrade = toDisplayMatchGrade(notice.matchGrade);
  const gradeStyle = getMatchGradeStyle(displayGrade);
  const dueStatus = getDueStatus(notice.deadline);
  const statusStyle = dueStatusStyles[dueStatus];
  const dueStatusLabel = dueStatusLabels[dueStatus];
  const budgetInfo = getBudgetInfo(notice.budget);
  const deadlineLabel =
    dueStatus === "마감일 확인 필요" ? "마감일 확인 필요" : notice.deadline;
  const noticeDateLabel = notice.noticeDate?.trim()
    ? notice.noticeDate
    : "게시일 확인 필요";
  const hasNoticeDate = Boolean(notice.noticeDate?.trim());
  const displayProducts = dedupeDisplayProducts(notice.relatedProducts);

  return (
    <article
      className={`relative rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md dark:bg-slate-900/70 dark:backdrop-blur-sm sm:p-6 ${
        notice.isNew
          ? "border-amber-300 ring-1 ring-amber-200/70 hover:border-amber-400 dark:border-amber-300/40 dark:ring-amber-400/20 dark:hover:border-amber-300/60"
          : "border-slate-200 hover:border-blue-200 dark:border-white/10 dark:hover:border-blue-400/30"
      } ${dueStatus === "마감 지남" ? "opacity-90" : ""}`}
      style={
        notice.isNew
          ? { boxShadow: "inset 4px 0 0 0 #f59e0b" }
          : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {notice.isNew && (
          <span
            title="최근 24시간 안에 처음 들어온 공고"
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-extrabold text-amber-800 ring-1 ring-inset ring-amber-400/60 dark:bg-amber-400/20 dark:text-amber-100 dark:ring-amber-300/60"
          >
            <span aria-hidden>★</span>
            <span>신규</span>
          </span>
        )}
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
          className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-white/10"
        >
          점수 {notice.fitScore}
        </span>
      </div>

      <div className="mt-4 sm:mt-5">
        <h2 className="text-base font-bold leading-snug text-slate-900 dark:text-slate-50 sm:text-lg">
          {notice.title}
        </h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          {notice.agency}
        </p>
        {notice.customer && (
          <CustomerInline customer={notice.customer} agency={notice.agency} />
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-md">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100 dark:bg-slate-800/40 dark:ring-white/5">
          <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            게시일
          </p>
          <p
            className={`mt-0.5 text-sm font-semibold ${
              hasNoticeDate
                ? "text-slate-900 dark:text-slate-100"
                : "text-amber-700 dark:text-amber-300"
            }`}
          >
            {noticeDateLabel}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100 dark:bg-slate-800/40 dark:ring-white/5">
          <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            마감일
          </p>
          <p className={`mt-0.5 text-sm font-semibold ${statusStyle.deadline}`}>
            {deadlineLabel}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {displayProducts.map((product) => (
          <span
            key={product}
            className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
          >
            {product}
          </span>
        ))}
      </div>

      {(() => {
        // keywords 가 null/undefined/빈 값이거나 같은 키워드가 중복으로 들어오는 경우를 방어.
        const uniqueKeywords = Array.from(
          new Set((notice.keywords ?? []).filter((kw): kw is string => Boolean(kw))),
        );
        if (uniqueKeywords.length === 0) return null;
        return (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {uniqueKeywords.map((keyword, index) => (
              <span
                key={`${keyword}-${index}`}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
              >
                {keyword}
              </span>
            ))}
          </div>
        );
      })()}

      {notice.summary && (
        <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {notice.summary}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-white/5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            예산
          </span>
          {budgetInfo.amount != null ? (
            <span className="inline-flex items-center whitespace-nowrap rounded-md bg-amber-50 px-2 py-0.5 text-sm font-bold tabular-nums text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30">
              {budgetInfo.korean ?? budgetInfo.formatted}
            </span>
          ) : (
            <span className="inline-flex items-center whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-white/10">
              예산 미공개
            </span>
          )}
          {budgetInfo.korean && budgetInfo.formatted && (
            <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              ({budgetInfo.formatted})
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={notice.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            공고 보기
          </a>
          {onOpenFeedback && (
            <button
              type="button"
              onClick={onOpenFeedback}
              className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
                hasFeedback
                  ? "bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
                  : "bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30 dark:hover:bg-violet-500/25"
              }`}
            >
              {hasFeedback ? "피드백 ✓" : "피드백"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleSave(notice.id)}
            className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
              isSaved
                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800"
            }`}
          >
            {isSaved ? "관심 해제" : "관심 저장"}
          </button>
        </div>
      </div>
    </article>
  );
}
