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
  "진행 중": "bg-[#E5F5EA] text-[#1A8245] ring-[#BDE5C8]",
  "마감 지남": "bg-[#F2F4F6] text-[#6B7684] ring-[#E5E8EB]",
  "마감일 확인 필요": "bg-[#FFF4E0] text-[#E68600] ring-[#FFE0A3]",
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
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#E5F5EA] px-2 py-0.5 text-[11px] font-bold text-[#1A8245] ring-1 ring-inset ring-[#BDE5C8]">
        Named
      </span>
    );
  }
  if (label === "Non Named") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#F2F4F6] px-2 py-0.5 text-[11px] font-semibold text-[#6B7684] ring-1 ring-inset ring-[#E5E8EB]">
        Non Named
      </span>
    );
  }
  if (label === "미매칭") {
    return <span className="text-xs text-[#8B95A1]">-</span>;
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#FFF4E0] px-2 py-0.5 text-[11px] font-semibold text-[#E68600] ring-1 ring-inset ring-[#FFE0A3]">
      {label}
    </span>
  );
}

export default function NoticeTable({ notices, savedIds, onToggleSave }: Props) {
  if (notices.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#D1D6DB] bg-white px-6 py-14 text-center">
        <p className="text-base font-semibold text-[#191F28]">검색 결과가 없습니다</p>
        <p className="mt-2 text-sm text-[#6B7684]">검색어나 제품 필터를 변경해 다시 시도해 보세요.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#E5E8EB] bg-white shadow-sm">
      {/*
        PC(lg+) 에서는 가로 스크롤이 없도록 table-fixed + colgroup 으로 컬럼 폭을 % 로 고정한다.
        md~lg(768~1024) 영역에서는 너무 좁아질 수 있어 overflow-x-auto 로 안전망만 둔다.
        모바일(<md)은 page.tsx 에서 카드 UI 로 분기되어 이 테이블이 보이지 않는다.
      */}
      <div className="w-full overflow-x-auto lg:overflow-x-visible">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "7%" }} /> {/* 상태 */}
            <col style={{ width: "7%" }} /> {/* 추천 */}
            <col style={{ width: "8%" }} /> {/* 제품 */}
            <col style={{ width: "28%" }} /> {/* 공고명 + 보조정보(키워드/예산/원문/관심) */}
            <col style={{ width: "18%" }} /> {/* 기관/고객사 */}
            <col style={{ width: "8%" }} /> {/* 담당본부 */}
            <col style={{ width: "7%" }} /> {/* Named */}
            <col style={{ width: "7%" }} /> {/* 지역 */}
            <col style={{ width: "5%" }} /> {/* 게시일 */}
            <col style={{ width: "5%" }} /> {/* 마감일 */}
          </colgroup>
          <thead className="bg-[#F9FAFB] text-xs font-semibold uppercase tracking-wide text-[#6B7684]">
            <tr>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">상태</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">추천</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">제품</th>
              <th scope="col" className="px-3 py-3 text-left">공고명</th>
              <th scope="col" className="px-3 py-3 text-left">기관/고객사</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">담당본부</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">Named</th>
              <th scope="col" className="px-3 py-3 text-left">지역</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">게시일</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-left">마감일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2F4F6]">
            {notices.map((notice) => {
              const status = getDueStatus(notice.deadline);
              // 화면에는 3단계(핵심검토/검토/참고)만 노출. 내부 "제외후보" 는 "참고" 로 통합.
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

              const handleRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
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
                  className={`group transition hover:bg-[#F9FBFF] focus:bg-[#F2F8FF] focus:outline-none ${
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
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#FFEBEB] px-2 py-0.5 text-[11px] font-bold text-[#C92A2A] ring-1 ring-inset ring-[#FFC9C9]">
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
                        className="whitespace-nowrap text-[10px] text-[#8B95A1]"
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
                            className="whitespace-nowrap rounded-md bg-[#E8F3FF] px-2 py-0.5 text-[11px] font-semibold text-[#1B64DA]"
                          >
                            {product}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[#8B95A1]">-</span>
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
                          className="text-sm font-semibold text-[#191F28] group-hover:text-[#1B64DA]"
                        >
                          {notice.title}
                        </div>
                        {(() => {
                          const uniqueKeywords = Array.from(
                            new Set(
                              (notice.keywords ?? []).filter((kw): kw is string => Boolean(kw)),
                            ),
                          );
                          const budgetText = formatBudget(notice.budget);
                          const showBudget = budgetText !== "미공개";
                          if (uniqueKeywords.length === 0 && !showBudget) return null;
                          return (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {showBudget && (
                                <span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#FFF7E0] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#9A6700] ring-1 ring-inset ring-[#FFE0A3]">
                                  {budgetText}
                                </span>
                              )}
                              {uniqueKeywords.slice(0, 8).map((kw, index) => (
                                <span
                                  key={`${kw}-${index}`}
                                  className="whitespace-nowrap rounded-md bg-[#F2F4F6] px-1.5 py-0.5 text-[11px] text-[#4E5968]"
                                >
                                  {kw}
                                </span>
                              ))}
                              {uniqueKeywords.length > 8 && (
                                <span className="whitespace-nowrap text-[11px] text-[#8B95A1]">
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
                              ? "bg-[#FFF4E0] text-[#E68600] ring-1 ring-[#FFE0A3]"
                              : "text-[#8B95A1] ring-1 ring-[#E5E8EB] hover:bg-[#F9FAFB]"
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
                            className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-[#3182F6] px-2 text-[11px] font-semibold text-white transition hover:bg-[#1B64DA]"
                          >
                            원문 ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 5. 기관/고객사 — 단어 단위 줄바꿈 + 매칭된 고객사명 보조 표시 */}
                  <td className="whitespace-normal break-keep px-3 py-3 align-top">
                    <div title={notice.agency} className="text-xs leading-5 text-[#4E5968]">
                      {notice.agency}
                    </div>
                    {notice.customer && notice.customer.customerName !== notice.agency && (
                      <div
                        title={`내부 매칭: ${notice.customer.customerName} (${
                          notice.customer.matchType === "exact"
                            ? "정확 일치"
                            : notice.customer.matchType === "normalized"
                              ? "정규화 일치"
                              : "포함관계 일치"
                        })`}
                        className="mt-1 text-[11px] leading-4 text-[#3182F6]"
                      >
                        ↳ {notice.customer.customerName}
                      </div>
                    )}
                  </td>

                  {/* 5-1. 담당본부 */}
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    {notice.customer?.territory ? (
                      <span className="text-xs font-semibold text-[#191F28]">
                        {notice.customer.territory}
                      </span>
                    ) : (
                      <span className="text-xs text-[#8B95A1]">미매칭</span>
                    )}
                  </td>

                  {/* 5-2. Named */}
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    {notice.customer ? (
                      <NamedBadge accountType={notice.customer.accountType} />
                    ) : (
                      <span className="text-xs text-[#8B95A1]">-</span>
                    )}
                  </td>

                  {/* 5-3. 지역 */}
                  <td className="px-3 py-3 align-top">
                    {notice.customer && (notice.customer.region || notice.customer.regionGroup) ? (
                      <div className="flex flex-col gap-0.5">
                        {notice.customer.region && (
                          <span className="whitespace-nowrap text-xs text-[#191F28]">
                            {notice.customer.region}
                          </span>
                        )}
                        {notice.customer.regionGroup && (
                          <span className="whitespace-nowrap text-[10px] text-[#8B95A1]">
                            {notice.customer.regionGroup}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-[#8B95A1]">-</span>
                    )}
                  </td>

                  {/* 6. 게시일 */}
                  <td className="whitespace-nowrap px-3 py-3 align-top text-xs text-[#4E5968]">
                    {formatNoticeDate(notice.noticeDate)}
                  </td>

                  {/* 7. 마감일 + D-day */}
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    <div
                      className={`text-xs font-semibold ${
                        imminent ? "text-[#C92A2A]" : "text-[#191F28]"
                      }`}
                    >
                      {formatDeadline(notice.deadline, status)}
                    </div>
                    {dday && (
                      <div
                        className={`mt-0.5 text-[11px] font-semibold ${
                          imminent ? "text-[#C92A2A]" : "text-[#6B7684]"
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
