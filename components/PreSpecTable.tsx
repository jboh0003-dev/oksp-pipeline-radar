"use client";

import type { AnnouncementFeedback } from "@/lib/feedback";
import { getBudgetInfo } from "@/lib/budget";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

const RECOMMENDATION_BADGE: Record<string, string> = {
  "핵심검토":
    "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30",
  "의견제출검토":
    "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30",
  "영업확인필요":
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
  "참고":
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-white/10",
  "제외":
    "bg-slate-50 text-slate-400 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-500 dark:ring-white/10",
};

const STATUS_BADGE: Record<string, string> = {
  "진행중":
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
  "마감임박":
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30",
  "마감":
    "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:ring-white/10",
  "확인필요":
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
};

type Props = {
  items: PreSpecAnnouncement[];
  savedKeys: Set<string>;
  feedbackMap: Map<string, AnnouncementFeedback>;
  onToggleSave: (key: string) => void;
  onOpenFeedback: (item: PreSpecAnnouncement) => void;
};

export default function PreSpecTable({
  items,
  savedKeys,
  feedbackMap,
  onToggleSave,
  onOpenFeedback,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-slate-900/60">
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          표시할 사전규격이 없습니다
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          상단에서 &quot;지금 수집&quot;을 눌러 최신 사전규격공고를 받아오세요.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/60">
      <div className="w-full overflow-x-auto lg:overflow-x-visible">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-3 py-3.5 text-left">상태</th>
              <th className="px-3 py-3.5 text-left">추천</th>
              <th className="px-3 py-3.5 text-left">제품</th>
              <th className="px-3 py-3.5 text-left">사전규격명</th>
              <th className="px-3 py-3.5 text-right">배정예산</th>
              <th className="px-3 py-3.5 text-left">기관</th>
              <th className="px-3 py-3.5 text-left">담당본부</th>
              <th className="px-3 py-3.5 text-left">의견마감</th>
              <th className="px-3 py-3.5 text-left">규격서</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {items.map((item) => {
              const isSaved = savedKeys.has(item.announcementKey);
              const hasFeedback = feedbackMap.has(item.announcementKey);
              const budget = getBudgetInfo(String(item.budget || ""));
              const status = item.status;
              const rec = item.recommendation;
              const isImminent = status === "마감임박";
              return (
                <tr
                  key={item.announcementKey}
                  className={`group relative transition ${
                    item.isNew
                      ? "bg-amber-50/40 hover:bg-amber-50 dark:bg-amber-400/10 dark:hover:bg-amber-400/15"
                      : "hover:bg-blue-50/50 dark:hover:bg-slate-800/60"
                  } ${status === "마감" ? "opacity-70" : ""}`}
                  style={
                    item.isNew
                      ? { boxShadow: "inset 4px 0 0 0 #f59e0b" }
                      : undefined
                  }
                >
                  <td className="px-3 py-3 align-top">
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_BADGE[status] ?? STATUS_BADGE["확인필요"]}`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${RECOMMENDATION_BADGE[rec] ?? RECOMMENDATION_BADGE["참고"]}`}
                    >
                      {rec}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      {item.products.length > 0 ? (
                        item.products.map((p) => (
                          <span
                            key={p}
                            className="whitespace-nowrap rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200/70 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/30"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-normal break-keep px-3 py-3 align-top leading-6">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.isNew && (
                            <span className="mr-1.5 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-amber-400/20 px-2 py-0.5 align-middle text-[11px] font-extrabold text-amber-700 ring-1 ring-inset ring-amber-400/60 dark:text-amber-200 dark:ring-amber-300/60">
                              <span aria-hidden>★</span>
                              <span>신규</span>
                            </span>
                          )}
                          {item.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {item.bsnsDivLabel && (
                            <span className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                              {item.bsnsDivLabel}
                            </span>
                          )}
                          {item.preSpecRegNo && (
                            <span className="whitespace-nowrap rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-white/10">
                              {item.preSpecRegNo}
                            </span>
                          )}
                          {item.linkedBidNo && (
                            <span className="whitespace-nowrap rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
                              입찰연결 · {item.linkedBidNo}
                            </span>
                          )}
                        </div>
                        {item.matchedKeywords.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {item.matchedKeywords.slice(0, 8).map((kw, i) => (
                              <span
                                key={`${kw}-${i}`}
                                className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
                              >
                                {kw}
                              </span>
                            ))}
                            {item.matchedKeywords.length > 8 && (
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                +{item.matchedKeywords.length - 8}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onToggleSave(item.announcementKey)}
                          aria-label={isSaved ? "관심 해제" : "관심 저장"}
                          title={isSaved ? "관심 해제" : "관심 저장"}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-base transition ${
                            isSaved
                              ? "bg-amber-50 text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30"
                              : "text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-500 dark:ring-white/10 dark:hover:bg-slate-800"
                          }`}
                        >
                          {isSaved ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenFeedback(item)}
                          title={hasFeedback ? "피드백 보기/수정" : "피드백 작성"}
                          className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md px-2 text-[11px] font-semibold transition ${
                            hasFeedback
                              ? "bg-violet-600 text-white ring-1 ring-violet-500 hover:bg-violet-700 dark:bg-violet-500"
                              : "bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30"
                          }`}
                        >
                          {hasFeedback ? "피드백 ✓" : "피드백"}
                        </button>
                        {item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="나라장터 사전규격 검색"
                            className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-blue-600 px-2 text-[11px] font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500"
                          >
                            원문 ↗
                          </a>
                        ) : (
                          <span className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-slate-100 px-2 text-[11px] font-medium text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
                            원문없음
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top text-right">
                    {budget.amount != null ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {budget.korean ?? budget.formatted}
                        </span>
                        {budget.korean && budget.formatted && (
                          <span className="whitespace-nowrap text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                            {budget.formatted}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
                        예산 미공개
                      </span>
                    )}
                  </td>
                  <td className="whitespace-normal break-keep px-3 py-3 align-top">
                    <div className="text-xs leading-5 text-slate-700 dark:text-slate-300">
                      {item.orgName}
                    </div>
                    {item.demandOrgName && item.demandOrgName !== item.orgName && (
                      <div className="mt-1 text-[11px] leading-4 text-blue-600 dark:text-blue-300">
                        ↳ {item.demandOrgName}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {item.customer?.territory ? (
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {item.customer.territory}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">미매칭</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div
                      className={`text-xs font-semibold ${
                        isImminent
                          ? "text-rose-600 dark:text-rose-300"
                          : "text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      {item.opinionDeadline ?? "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    {item.specFileUrl || item.fileUrl ? (
                      <a
                        href={item.specFileUrl ?? item.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-cyan-600 px-2 text-[11px] font-semibold text-white transition hover:bg-cyan-700 dark:bg-cyan-500"
                      >
                        규격서 ↗
                      </a>
                    ) : (
                      <span className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-slate-100 px-2 text-[11px] font-medium text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                        파일없음
                      </span>
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
