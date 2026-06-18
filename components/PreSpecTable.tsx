"use client";

import { useEffect, useState } from "react";
import type { AnnouncementFeedback } from "@/lib/feedback";
import { getBudgetInfo } from "@/lib/budget";
import { buildPreSpecG2bSearchUrl, isVerifiedHttpUrl } from "@/lib/preSpec/detailUrl";
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

const ACTION_BTN =
  "inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md px-2 text-[11px] font-semibold transition";

type Props = {
  items: PreSpecAnnouncement[];
  savedKeys: Set<string>;
  feedbackMap: Map<string, AnnouncementFeedback>;
  onToggleSave: (key: string) => void;
  onOpenFeedback: (item: PreSpecAnnouncement) => void;
  isAdmin?: boolean;
  emptyReason?: "no-data" | "filtered";
};

async function copyText(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text.trim());
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function collectSpecUrls(item: PreSpecAnnouncement): string[] {
  const urls: string[] = [];
  for (const att of item.attachments ?? []) {
    if (att.type === "규격서" && isVerifiedHttpUrl(att.url)) {
      urls.push(att.url);
    }
  }
  for (const legacy of [item.specFileUrl, item.attachmentUrl, item.fileUrl]) {
    if (isVerifiedHttpUrl(legacy) && !urls.includes(legacy)) {
      urls.push(legacy);
    }
  }
  return urls;
}

export default function PreSpecTable({
  items,
  savedKeys,
  feedbackMap,
  onToggleSave,
  onOpenFeedback,
  isAdmin = false,
  emptyReason = "no-data",
}: Props) {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const onCopyTitle = async (item: PreSpecAnnouncement) => {
    const ok = await copyText(item.title);
    setToast(
      ok
        ? "사전규격명이 복사되었습니다."
        : "복사에 실패했습니다. 사전규격명을 직접 선택해 복사해 주세요.",
    );
  };

  const onSearchG2b = async (item: PreSpecAnnouncement) => {
    const title = item.title.trim();
    await copyText(title);
    const url = buildPreSpecG2bSearchUrl({
      preSpecRegNo: item.preSpecRegNo,
      title: item.title,
    });
    window.open(url, "_blank", "noopener,noreferrer");
    setToast(
      "사전규격명을 복사했습니다. 나라장터 검색창에 붙여넣어 확인하세요.",
    );
  };

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-slate-900/60">
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          표시할 사전규격이 없습니다
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {emptyReason === "filtered"
            ? "현재 필터 조건에 맞는 사전규격이 없습니다. 필터를 조정해 보세요."
            : isAdmin
              ? "아직 수집된 사전규격공고가 없습니다. 상단 \"지금 수집\"으로 즉시 수집하거나, 자동 수집은 매일 08:30에 실행됩니다."
              : "아직 수집된 사전규격공고가 없습니다. 자동 수집은 매일 08:30에 실행됩니다."}
        </p>
        {emptyReason === "no-data" && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            새로고침은 저장된 공고를 다시 불러옵니다. 수집은 관리자와 서버 자동수집만 수행합니다.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/60">
        <div className="w-full overflow-x-auto lg:overflow-x-visible">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
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
                const specUrls = collectSpecUrls(item);

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
                      <div className="min-w-0">
                        <div className="flex items-start gap-1.5">
                          <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.isNew && (
                              <span className="mr-1.5 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-amber-400/20 px-2 py-0.5 align-middle text-[11px] font-extrabold text-amber-700 ring-1 ring-inset ring-amber-400/60 dark:text-amber-200 dark:ring-amber-300/60">
                                <span aria-hidden>★</span>
                                <span>신규</span>
                              </span>
                            )}
                            {item.title}
                          </p>
                          <button
                            type="button"
                            onClick={() => onToggleSave(item.announcementKey)}
                            aria-label={isSaved ? "관심 해제" : "관심 등록"}
                            title={isSaved ? "관심 해제" : "관심 등록"}
                            className={`shrink-0 text-base leading-none ${
                              isSaved ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
                            }`}
                          >
                            {isSaved ? "★" : "☆"}
                          </button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void onCopyTitle(item)}
                            title="사전규격명 복사"
                            className={`${ACTION_BTN} bg-slate-100 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-white/10`}
                          >
                            복사
                          </button>
                          <button
                            type="button"
                            onClick={() => void onSearchG2b(item)}
                            title="나라장터 사전규격 검색 (제목 복사 후 새 탭)"
                            className={`${ACTION_BTN} bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-500`}
                          >
                            검색
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenFeedback(item)}
                            title={hasFeedback ? "피드백 보기/수정" : "피드백 작성"}
                            className="text-[11px] font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-300"
                          >
                            {hasFeedback ? "피드백 ✓" : "피드백"}
                          </button>
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
                      <div className="flex flex-col gap-1">
                        {specUrls.length > 0 ? (
                          specUrls.map((url, idx) => (
                            <a
                              key={`${url}-${idx}`}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="규격서 파일을 새 탭으로 엽니다"
                              className={`${ACTION_BTN} bg-cyan-600 text-white hover:bg-cyan-700 dark:bg-cyan-500`}
                            >
                              규격서 {idx + 1}
                            </a>
                          ))
                        ) : (
                          <span
                            title="규격서 파일이 없습니다"
                            className={`${ACTION_BTN} cursor-not-allowed bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400`}
                          >
                            파일없음
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-slate-900/95 px-4 py-3 text-xs font-medium text-white shadow-lg ring-1 ring-white/10 dark:bg-slate-800/95"
        >
          {toast}
        </div>
      )}
    </>
  );
}
