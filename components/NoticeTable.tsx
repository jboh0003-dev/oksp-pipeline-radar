"use client";

import { CONTRABASS_FAMILY, type Notice } from "@/data/sampleNotices";
import { getBudgetInfo } from "@/lib/budget";
import { formatAccountTypeLabel, formatMatchTypeLabel } from "@/lib/customerMatching";
import { getMatchGradeStyle, toDisplayMatchGrade } from "@/lib/noticeGrades";
import type { SortColumn, SortState } from "@/lib/noticeSorting";
import {
  getDaysUntilDeadline,
  getDueStatus,
  isImminentDeadline,
  type DueStatus,
} from "@/lib/noticeVisibility";

const dueStatusBadge: Record<DueStatus, string> = {
  "진행 중":
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
  "마감 지남":
    "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:ring-white/10",
  "마감일 확인 필요":
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
};

const dueStatusLabels: Record<DueStatus, string> = {
  "진행 중": "진행 중",
  "마감 지남": "마감 지남",
  "마감일 확인 필요": "마감일 확인",
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

function formatNoticeDate(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "-";
  return trimmed.includes("T") ? trimmed.slice(0, 10) : trimmed;
}

function formatDeadline(deadline: string, status: DueStatus): string {
  if (status === "마감일 확인 필요") return "확인 필요";
  if (!deadline) return "-";
  return deadline.includes("T") ? deadline.slice(0, 10) : deadline;
}

function ddayLabel(deadline: string, status: DueStatus): string | null {
  if (status !== "진행 중") return null;
  const diff = getDaysUntilDeadline(deadline);
  if (diff == null) return null;
  if (diff === 0) return "D-day";
  if (diff > 0) return `D-${diff}`;
  return null;
}

type Props = {
  notices: Notice[];
  savedIds: string[];
  onToggleSave: (id: string) => void;
  /**
   * 현재 정렬 상태. 없으면 헤더 정렬 UI 를 비활성화한다(읽기 전용 테이블).
   * 정렬 자체는 호출부(page.tsx)에서 수행하므로 이 컴포넌트는 표시만 담당.
   */
  sortState?: SortState;
  /** 헤더 클릭 시 호출. 같은 컬럼이면 방향 토글, 다른 컬럼이면 자연스러운 방향으로 전환. */
  onSortChange?: (column: SortColumn) => void;
  /**
   * "매칭근거" 디버그 컬럼을 표시할지. 기본 false.
   * page.tsx 의 토글에서 제어한다.
   */
  showMatchSource?: boolean;
};

/**
 * 정렬 가능한 컬럼 헤더.
 *
 * - 활성 컬럼: 라벨 + 진한 화살표(▲ / ▼)
 * - 비활성 컬럼: 라벨 + 흐린 ↕ 힌트
 * - hover/focus 시 배경 강조 (라이트/다크 모두 처리)
 */
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
  state?: SortState;
  onSortChange?: (column: SortColumn) => void;
  align?: "left" | "right" | "center";
  whitespace?: string;
}) {
  const isActive = state?.column === column;
  const direction = isActive ? state?.direction : null;
  const ariaSort: React.AriaAttributes["aria-sort"] =
    isActive && direction
      ? direction === "asc"
        ? "ascending"
        : "descending"
      : "none";

  const handleClick = () => {
    if (onSortChange) onSortChange(column);
  };

  const alignmentClass =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  const cellAlignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const wsClass = whitespace ?? "whitespace-nowrap";

  // onSortChange 가 없으면 클릭 불가능한 일반 th 처럼 렌더 (호환용)
  if (!onSortChange) {
    return (
      <th scope="col" className={`${wsClass} px-3 py-3.5 ${cellAlignClass}`}>
        {label}
      </th>
    );
  }

  return (
    <th scope="col" aria-sort={ariaSort} className={`${wsClass} px-0 py-0 ${cellAlignClass}`}>
      <button
        type="button"
        onClick={handleClick}
        className={`group inline-flex w-full ${alignmentClass} items-center gap-1 px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-wide transition focus:outline-none ${
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
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="currentColor"
        aria-hidden
        className="shrink-0"
      >
        <path d="M5 2.2 8.6 7H1.4z" />
      </svg>
    );
  }
  if (active && direction === "desc") {
    return (
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="currentColor"
        aria-hidden
        className="shrink-0"
      >
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

function NamedBadge({ accountType }: { accountType: string | null | undefined }) {
  const label = formatAccountTypeLabel(accountType);
  if (label === "Named") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
        Named
      </span>
    );
  }
  if (label === "Non Named") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-white/10">
        Non Named
      </span>
    );
  }
  if (label === "미매칭") {
    return <span className="text-xs text-slate-400 dark:text-slate-500">-</span>;
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30">
      {label}
    </span>
  );
}

export default function NoticeTable({
  notices,
  savedIds,
  onToggleSave,
  sortState,
  onSortChange,
  showMatchSource = false,
}: Props) {
  if (notices.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-slate-900/60">
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          검색 결과가 없습니다
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          검색어나 제품 필터를 변경해 다시 시도해 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/60 dark:backdrop-blur-sm">
      {/*
        PC(lg+) 에서는 가로 스크롤이 없도록 table-fixed + colgroup 으로 컬럼 폭을 % 로 고정한다.
        md~lg(768~1024) 영역에서는 너무 좁아질 수 있어 overflow-x-auto 로 안전망만 둔다.
        모바일(<md)은 page.tsx 에서 카드 UI 로 분기되어 이 테이블이 보이지 않는다.
      */}
      <div className="w-full overflow-x-auto lg:overflow-x-visible">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: showMatchSource ? "6%" : "7%" }} />
            <col style={{ width: showMatchSource ? "6%" : "7%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: showMatchSource ? "20%" : "22%" }} />
            {/* 예산: 공고명 바로 다음 — 회의 피드백 기준 */}
            <col style={{ width: showMatchSource ? "11%" : "12%" }} />
            <col style={{ width: showMatchSource ? "13%" : "15%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "6%" }} />
            {showMatchSource && <col style={{ width: "7%" }} />}
          </colgroup>
          <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              {/* 상태 컬럼은 정렬 대상이 아님 (마감/임박 배지) */}
              <th scope="col" className="whitespace-nowrap px-3 py-3.5 text-left">
                상태
              </th>
              <SortableHeader
                column="fit"
                label="추천"
                state={sortState}
                onSortChange={onSortChange}
              />
              <SortableHeader
                column="product"
                label="제품"
                state={sortState}
                onSortChange={onSortChange}
              />
              <SortableHeader
                column="title"
                label="공고명"
                state={sortState}
                onSortChange={onSortChange}
                whitespace=""
              />
              <SortableHeader
                column="budget"
                label="예산"
                state={sortState}
                onSortChange={onSortChange}
                align="right"
              />
              <SortableHeader
                column="agency"
                label="기관/고객사"
                state={sortState}
                onSortChange={onSortChange}
                whitespace=""
              />
              <SortableHeader
                column="territory"
                label="담당본부"
                state={sortState}
                onSortChange={onSortChange}
              />
              <SortableHeader
                column="named"
                label="Named"
                state={sortState}
                onSortChange={onSortChange}
              />
              <SortableHeader
                column="region"
                label="지역"
                state={sortState}
                onSortChange={onSortChange}
                whitespace=""
              />
              <SortableHeader
                column="noticeDate"
                label="게시일"
                state={sortState}
                onSortChange={onSortChange}
              />
              <SortableHeader
                column="deadline"
                label="마감일"
                state={sortState}
                onSortChange={onSortChange}
              />
              {showMatchSource && (
                <th
                  scope="col"
                  className="whitespace-nowrap px-3 py-3.5 text-left"
                  title="기관명 → 고객사 매칭에 사용된 단계 (디버그)"
                >
                  매칭근거
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {notices.map((notice) => {
              const status = getDueStatus(notice.deadline);
              const displayGrade = toDisplayMatchGrade(notice.matchGrade);
              const gradeStyle = getMatchGradeStyle(displayGrade);
              const products = dedupeDisplayProducts(notice.relatedProducts);
              const imminent = isImminentDeadline(notice.deadline);
              const dday = ddayLabel(notice.deadline, status);
              const isSaved = savedIds.includes(notice.id);
              const hasUrl = Boolean(notice.sourceUrl);

              const handleRowClick = () => {
                if (!hasUrl) return;
                window.open(notice.sourceUrl, "_blank", "noopener,noreferrer");
              };

              const handleRowKeyDown = (
                event: React.KeyboardEvent<HTMLTableRowElement>,
              ) => {
                if (!hasUrl) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  window.open(notice.sourceUrl, "_blank", "noopener,noreferrer");
                }
              };

              return (
                <tr
                  key={notice.id}
                  tabIndex={hasUrl ? 0 : -1}
                  onClick={handleRowClick}
                  onKeyDown={handleRowKeyDown}
                  className={`group transition hover:bg-blue-50/50 focus:bg-blue-50 focus:outline-none dark:hover:bg-slate-800/60 dark:focus:bg-slate-800 ${
                    hasUrl ? "cursor-pointer" : ""
                  } ${status === "마감 지남" ? "opacity-70" : ""}`}
                >
                  {/* 1. 상태 */}
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      <span
                        className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${dueStatusBadge[status]}`}
                      >
                        {dueStatusLabels[status]}
                      </span>
                      {imminent && (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30">
                          마감임박
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 2. 추천등급 (점수는 보조 표시) */}
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={`inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${gradeStyle.badge}`}
                      >
                        {displayGrade}
                      </span>
                      <span
                        title="점수 기반 기본 추천도 (참고용)"
                        className="whitespace-nowrap text-[10px] text-slate-400 dark:text-slate-500"
                      >
                        점수 {notice.fitScore}
                      </span>
                    </div>
                  </td>

                  {/* 3. 제품 (배지) */}
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      {products.length > 0 ? (
                        products.map((product) => (
                          <span
                            key={product}
                            className="whitespace-nowrap rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200/70 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/30"
                          >
                            {product}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          -
                        </span>
                      )}
                    </div>
                  </td>

                  {/*
                    4. 공고명 — 단어 단위 줄바꿈, 우측에 ★/원문 inline.
                    예산·매칭 키워드는 별도 컬럼을 두지 않고 공고명 아래 보조 라인으로 통합한다.
                  */}
                  <td className="whitespace-normal break-keep px-3 py-3 align-top leading-6">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div
                          title={notice.title}
                          className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 dark:text-slate-100 dark:group-hover:text-blue-300"
                        >
                          {notice.title}
                        </div>
                        {(() => {
                          const uniqueKeywords = Array.from(
                            new Set(
                              (notice.keywords ?? []).filter(
                                (kw): kw is string => Boolean(kw),
                              ),
                            ),
                          );
                          if (uniqueKeywords.length === 0) return null;
                          // 예산은 별도 컬럼으로 분리됨 — 여기서는 매칭 키워드만 표시.
                          return (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {uniqueKeywords.slice(0, 8).map((kw, index) => (
                                <span
                                  key={`${kw}-${index}`}
                                  className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
                                >
                                  {kw}
                                </span>
                              ))}
                              {uniqueKeywords.length > 8 && (
                                <span className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
                                  +{uniqueKeywords.length - 8}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={isSaved ? "관심 해제" : "관심 저장"}
                          title={isSaved ? "관심 해제" : "관심 저장"}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleSave(notice.id);
                          }}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-base transition ${
                            isSaved
                              ? "bg-amber-50 text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30"
                              : "text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-500 dark:ring-white/10 dark:hover:bg-slate-800"
                          }`}
                        >
                          {isSaved ? "★" : "☆"}
                        </button>
                        {hasUrl && (
                          <a
                            href={notice.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            title="원문 새 창에서 보기"
                            className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-blue-600 px-2 text-[11px] font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                          >
                            원문 ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 5. 예산 — 천 단위 콤마 + 한글 보조 (공고명 바로 다음) */}
                  <td className="px-3 py-3 align-top text-right">
                    {(() => {
                      const budget = getBudgetInfo(notice.budget);
                      if (budget.amount == null) {
                        return (
                          <span className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
                            금액 정보 없음
                          </span>
                        );
                      }
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                            {budget.formatted}
                          </span>
                          {budget.korean && (
                            <span className="whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">
                              {budget.korean}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* 6. 기관/고객사 — 단어 단위 줄바꿈 + 매칭된 고객사명 보조 표시 */}
                  <td className="whitespace-normal break-keep px-3 py-3 align-top">
                    <div
                      title={notice.agency}
                      className="text-xs leading-5 text-slate-700 dark:text-slate-300"
                    >
                      {notice.agency}
                    </div>
                    {notice.customer &&
                      notice.customer.customerName !== notice.agency && (
                        <div
                          title={`내부 매칭: ${notice.customer.customerName} (${formatMatchTypeLabel(notice.customer.matchType)})`}
                          className="mt-1 text-[11px] leading-4 text-blue-600 dark:text-blue-300"
                        >
                          ↳ {notice.customer.customerName}
                        </div>
                      )}
                  </td>

                  {/* 7. 담당본부 */}
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    {notice.customer?.territory ? (
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {notice.customer.territory}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        미매칭
                      </span>
                    )}
                  </td>

                  {/* 8. Named */}
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    {notice.customer ? (
                      <NamedBadge accountType={notice.customer.accountType} />
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        -
                      </span>
                    )}
                  </td>

                  {/* 9. 지역 */}
                  <td className="px-3 py-3 align-top">
                    {notice.customer &&
                    (notice.customer.region || notice.customer.regionGroup) ? (
                      <div className="flex flex-col gap-0.5">
                        {notice.customer.region && (
                          <span className="whitespace-nowrap text-xs text-slate-900 dark:text-slate-100">
                            {notice.customer.region}
                          </span>
                        )}
                        {notice.customer.regionGroup && (
                          <span className="whitespace-nowrap text-[10px] text-slate-400 dark:text-slate-500">
                            {notice.customer.regionGroup}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        -
                      </span>
                    )}
                  </td>

                  {/* 10. 게시일 */}
                  <td className="whitespace-nowrap px-3 py-3 align-top text-xs text-slate-600 dark:text-slate-400">
                    {formatNoticeDate(notice.noticeDate)}
                  </td>

                  {/* 11. 마감일 + D-day */}
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    <div
                      className={`text-xs font-semibold ${
                        imminent
                          ? "text-rose-600 dark:text-rose-300"
                          : "text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      {formatDeadline(notice.deadline, status)}
                    </div>
                    {dday && (
                      <div
                        className={`mt-0.5 text-[11px] font-semibold ${
                          imminent
                            ? "text-rose-600 dark:text-rose-300"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {dday}
                      </div>
                    )}
                  </td>

                  {/* 12. 매칭근거 (디버그 모드 토글 시에만 노출) */}
                  {showMatchSource && (
                    <td className="whitespace-nowrap px-3 py-3 align-top">
                      <MatchSourceBadge
                        matchType={notice.customer?.matchType ?? null}
                        territory={notice.customer?.territory ?? null}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 매칭 단계 → 디버그 배지.
 *  - exact / normalized / alias / contains / fuzzy / unmatched(미매칭)
 *  - territory 가 비어 있으면 "본부 미매칭" 보조 표시도 함께 노출.
 */
function MatchSourceBadge({
  matchType,
  territory,
}: {
  matchType: NonNullable<Notice["customer"]>["matchType"] | null;
  territory: string | null;
}) {
  const tone =
    matchType === "exact"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30"
      : matchType === "normalized"
        ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30"
        : matchType === "alias"
          ? "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30"
          : matchType === "contains"
            ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30"
            : matchType === "fuzzy"
              ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30"
              : "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:ring-white/10";
  const label = matchType ?? "unmatched";

  return (
    <div className="flex flex-col gap-0.5">
      <span
        title={formatMatchTypeLabel(matchType ?? "unmatched")}
        className={`inline-flex w-fit items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${tone}`}
      >
        {label}
      </span>
      {!territory && (
        <span className="text-[10px] text-slate-400 dark:text-slate-500">본부 미매칭</span>
      )}
    </div>
  );
}
