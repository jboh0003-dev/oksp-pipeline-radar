"use client";

import { type Notice } from "@/data/sampleNotices";
import { getBudgetInfo } from "@/lib/budget";
import {
  formatAccountTypeLabel,
  formatMatchTypeLabel,
} from "@/lib/customerMatching";
import type { SortColumn, SortState } from "@/lib/noticeSorting";
import { getDueStatus, isImminentDeadline, type DueStatus } from "@/lib/noticeVisibility";

const dueStatusBadge: Record<DueStatus, string> = {
  "진행 중":
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
  "마감 지남":
    "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:ring-white/10",
  "마감일 확인 필요":
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
};

function formatDeadline(deadline: string, status: DueStatus): string {
  if (status === "마감일 확인 필요") return "확인 필요";
  if (!deadline) return "-";
  return deadline.includes("T") ? deadline.slice(0, 10) : deadline;
}

type Props = {
  notices: Notice[];
  sortState: SortState;
  onSortChange: (column: SortColumn) => void;
};

/**
 * 예산 보기 전용 테이블.
 *
 * 컬럼 구성: 공고명 / 기관·고객사 / 예산 / 마감일 / 매칭 상태
 * - 기본 정렬: 예산 내림차순 (page.tsx 의 view 전환 시 강제됨)
 * - 컬럼 헤더 클릭으로 정렬 가능 (NoticeTable 과 동일한 패턴)
 * - 예산은 천 단위 콤마 + 한글 금액 보조 표시
 */
export default function BudgetTable({ notices, sortState, onSortChange }: Props) {
  if (notices.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-slate-900/60">
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          표시할 공고가 없습니다
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          검색어나 제품 필터, 매칭 상태 필터를 변경해 다시 시도해 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:backdrop-blur-sm">
      <div className="w-full overflow-x-auto lg:overflow-x-visible">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "32%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <SortableHeader
                column="title"
                label="공고명"
                state={sortState}
                onSortChange={onSortChange}
                whitespace=""
              />
              <SortableHeader
                column="agency"
                label="기관/고객사"
                state={sortState}
                onSortChange={onSortChange}
                whitespace=""
              />
              <SortableHeader
                column="budget"
                label="예산 (추정금액)"
                state={sortState}
                onSortChange={onSortChange}
                align="right"
              />
              <SortableHeader
                column="deadline"
                label="마감일"
                state={sortState}
                onSortChange={onSortChange}
              />
              <th scope="col" className="whitespace-nowrap px-3 py-3.5 text-left">
                매칭 상태
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {notices.map((notice) => {
              const status = getDueStatus(notice.deadline);
              const imminent = isImminentDeadline(notice.deadline);
              const budget = getBudgetInfo(notice.budget);
              const hasUrl = Boolean(notice.sourceUrl);

              const handleRowClick = () => {
                if (!hasUrl) return;
                window.open(notice.sourceUrl, "_blank", "noopener,noreferrer");
              };

              return (
                <tr
                  key={notice.id}
                  onClick={handleRowClick}
                  className={`group transition hover:bg-blue-50/50 dark:hover:bg-slate-800/60 ${
                    hasUrl ? "cursor-pointer" : ""
                  }`}
                >
                  <td className="whitespace-normal break-keep px-3 py-3 align-top leading-6">
                    <div
                      title={notice.title}
                      className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 dark:text-slate-100 dark:group-hover:text-blue-300"
                    >
                      {notice.title}
                    </div>
                  </td>

                  <td className="whitespace-normal break-keep px-3 py-3 align-top">
                    <div className="text-xs leading-5 text-slate-700 dark:text-slate-300">
                      {notice.agency}
                    </div>
                    {notice.customer &&
                      notice.customer.customerName !== notice.agency && (
                        <div className="mt-1 text-[11px] leading-4 text-blue-600 dark:text-blue-300">
                          ↳ {notice.customer.customerName}
                        </div>
                      )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-right align-top">
                    {budget.amount != null ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-amber-50 px-2 py-0.5 text-sm font-bold tabular-nums text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30">
                          {budget.formatted}
                        </span>
                        {budget.korean && (
                          <span className="whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">
                            {budget.korean}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-white/10">
                        {budget.display}
                      </span>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${dueStatusBadge[status]}`}
                    >
                      {formatDeadline(notice.deadline, status)}
                    </span>
                    {imminent && (
                      <div className="mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-300">
                        마감임박
                      </div>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    <MatchStatusBadge notice={notice} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatchStatusBadge({ notice }: { notice: Notice }) {
  const territory = notice.customer?.territory?.trim() ?? "";
  const named = formatAccountTypeLabel(notice.customer?.accountType);

  if (!notice.customer || !territory) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex w-fit items-center whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30">
          본부 미매칭
        </span>
        {notice.customer && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {formatMatchTypeLabel(notice.customer.matchType)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex w-fit items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
        {territory}
      </span>
      <span className="text-[10px] text-slate-500 dark:text-slate-400">
        {named === "Named" ? "Named" : named === "Non Named" ? "Non Named" : "—"} ·{" "}
        {formatMatchTypeLabel(notice.customer.matchType)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 정렬 헤더 — NoticeTable 과 동일한 동작/모양을 따라간다.
// 별도 import 없이 컴포넌트 내부에 정의해 결합도를 낮춘다.
// ---------------------------------------------------------------------------

function SortableHeader({
  column,
  label,
  state,
  onSortChange,
  align = "left",
  whitespace,
}: {
  column: SortColumn;
  label: string;
  state: SortState;
  onSortChange: (column: SortColumn) => void;
  align?: "left" | "right" | "center";
  whitespace?: string;
}) {
  const isActive = state.column === column;
  const direction = isActive ? state.direction : null;
  const ariaSort: React.AriaAttributes["aria-sort"] =
    isActive && direction
      ? direction === "asc"
        ? "ascending"
        : "descending"
      : "none";
  const alignmentClass =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";
  const cellAlignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const wsClass = whitespace ?? "whitespace-nowrap";

  return (
    <th scope="col" aria-sort={ariaSort} className={`${wsClass} px-0 py-0 ${cellAlignClass}`}>
      <button
        type="button"
        onClick={() => onSortChange(column)}
        className={`group inline-flex w-full ${alignmentClass} items-center gap-1 px-3 py-3.5 text-xs font-semibold uppercase tracking-wide transition focus:outline-none ${
          isActive
            ? "text-blue-700 dark:text-blue-300"
            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        } hover:bg-blue-50/60 focus-visible:bg-blue-50/80 dark:hover:bg-slate-800/80 dark:focus-visible:bg-slate-800`}
      >
        <span>{label}</span>
        <SortIndicator active={isActive} direction={direction ?? null} />
      </button>
    </th>
  );
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction: "asc" | "desc" | null;
}) {
  if (active && direction === "asc") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden className="shrink-0">
        <path d="M5 2.2 8.6 7H1.4z" />
      </svg>
    );
  }
  if (active && direction === "desc") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden className="shrink-0">
        <path d="M5 7.8 1.4 3h7.2z" />
      </svg>
    );
  }
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="currentColor"
      aria-hidden
      className="shrink-0 text-slate-300 transition-opacity dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500"
    >
      <path d="M5 1.5 7.5 4.5h-5z" />
      <path d="M5 8.5 2.5 5.5h5z" />
    </svg>
  );
}
