"use client";

import { CONTRABASS_FAMILY, type Notice } from "@/data/sampleNotices";
import { formatAccountTypeLabel } from "@/lib/customerMatching";
import { getMatchGradeStyle, toDisplayMatchGrade } from "@/lib/noticeGrades";
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

function formatBudget(value: string | null | undefined): string {
  if (!value || value === "-") return "미공개";
  return value;
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
};

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

export default function NoticeTable({ notices, savedIds, onToggleSave }: Props) {
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
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "5%" }} />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">
                상태
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">
                추천
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">
                제품
              </th>
              <th scope="col" className="px-3 py-3 text-left">
                공고명
              </th>
              <th scope="col" className="px-3 py-3 text-left">
                기관/고객사
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">
                담당본부
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">
                Named
              </th>
              <th scope="col" className="px-3 py-3 text-left">
                지역
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">
                게시일
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">
                마감일
              </th>
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
                          const budgetText = formatBudget(notice.budget);
                          const showBudget = budgetText !== "미공개";
                          if (uniqueKeywords.length === 0 && !showBudget) return null;
                          return (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {showBudget && (
                                <span className="inline-flex items-center whitespace-nowrap rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">
                                  {budgetText}
                                </span>
                              )}
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

                  {/* 5. 기관/고객사 — 단어 단위 줄바꿈 + 매칭된 고객사명 보조 표시 */}
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
                          title={`내부 매칭: ${notice.customer.customerName} (${
                            notice.customer.matchType === "exact"
                              ? "정확 일치"
                              : notice.customer.matchType === "normalized"
                                ? "정규화 일치"
                                : "포함관계 일치"
                          })`}
                          className="mt-1 text-[11px] leading-4 text-blue-600 dark:text-blue-300"
                        >
                          ↳ {notice.customer.customerName}
                        </div>
                      )}
                  </td>

                  {/* 5-1. 담당본부 */}
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

                  {/* 5-2. Named */}
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    {notice.customer ? (
                      <NamedBadge accountType={notice.customer.accountType} />
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        -
                      </span>
                    )}
                  </td>

                  {/* 5-3. 지역 */}
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

                  {/* 6. 게시일 */}
                  <td className="whitespace-nowrap px-3 py-3 align-top text-xs text-slate-600 dark:text-slate-400">
                    {formatNoticeDate(notice.noticeDate)}
                  </td>

                  {/* 7. 마감일 + D-day */}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
