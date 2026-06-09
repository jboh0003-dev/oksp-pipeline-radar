"use client";

import { useEffect, useMemo, useState } from "react";
import {
  feedbacksToCsv,
  loadAllFeedbacks,
  type AnnouncementFeedback,
  type FeedbackSourceType,
} from "@/lib/feedback";

const SOURCE_LABEL: Record<FeedbackSourceType, string> = {
  BID: "입찰공고",
  PRE_SPEC: "사전규격공고",
};

const RATING_TONE: Record<string, string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30",
  bad: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30",
  neutral:
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-white/10",
};

const RATING_LABEL: Record<string, string> = {
  good: "좋음",
  bad: "나쁨",
  neutral: "애매함",
};

/**
 * 피드백 현황 페이지 — 영업이 입찰/사전규격 양쪽에 남긴 의견을 모아 보고,
 * CSV 로 내보낼 수 있다. 1차 버전 (localStorage 단일 사용자).
 *
 * TODO:
 *  - 다중 사용자/공유: API + DB 로 이전.
 *  - 본부별/제품별 통계, 작성자별 활동 등 시각화.
 */
export default function FeedbackPage() {
  const [list, setList] = useState<AnnouncementFeedback[]>([]);
  const [filter, setFilter] = useState<"ALL" | FeedbackSourceType>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setList(loadAllFeedbacks());
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((f) => {
      const src = (f.sourceType ?? "BID") as FeedbackSourceType;
      if (filter !== "ALL" && src !== filter) return false;
      if (q) {
        const hay = [f.noticeTitle ?? "", f.memo, f.author ?? "", f.announcementKey]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [list, filter, search]);

  const handleDownloadCsv = () => {
    const csv = feedbacksToCsv(filtered);
    // BOM 포함해서 엑셀에서 한글이 깨지지 않게 한다.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `csg2b-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7 md:max-w-[1800px] md:px-6">
        <header className="relative mb-4 overflow-hidden rounded-2xl ring-1 ring-white/15 shadow-md csg2b-header-bg dark:ring-white/10">
          <div className="relative px-5 py-5 sm:px-7 sm:py-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90">
              OKESTRO CS-G2B
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">
              피드백 현황
            </h1>
            <p className="mt-1 hidden text-xs text-slate-200/85 sm:block">
              입찰공고·사전규격공고에 남긴 영업 의견 모아보기
            </p>
          </div>
        </header>

        <section className="mb-3 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="공고명 / 메모 / 작성자 검색"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 sm:w-72"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "ALL" | FeedbackSourceType)}
              className="h-9 rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 sm:text-sm"
            >
              <option value="ALL">전체 ({list.length})</option>
              <option value="BID">입찰공고</option>
              <option value="PRE_SPEC">사전규격공고</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={filtered.length === 0}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-blue-500 dark:hover:bg-blue-400 sm:text-sm"
          >
            CSV 내보내기 ({filtered.length})
          </button>
        </section>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-slate-900/60">
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              저장된 피드백이 없습니다
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              입찰공고 또는 사전규격공고 화면에서 "피드백" 버튼을 눌러 의견을 등록해 보세요.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((f) => {
              const src = (f.sourceType ?? "BID") as FeedbackSourceType;
              return (
                <article
                  key={f.id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span
                          className={`rounded-md px-1.5 py-0.5 font-semibold ring-1 ring-inset ${
                            src === "PRE_SPEC"
                              ? "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/30"
                              : "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30"
                          }`}
                        >
                          {SOURCE_LABEL[src]}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${RATING_TONE[f.rating] ?? RATING_TONE.neutral}`}
                        >
                          전체: {RATING_LABEL[f.rating] ?? f.rating}
                        </span>
                        {f.author && (
                          <span className="text-slate-400 dark:text-slate-500">· {f.author}</span>
                        )}
                        <span className="text-slate-400 dark:text-slate-500">
                          · {new Date(f.updatedAt).toLocaleString("ko-KR")}
                        </span>
                      </div>
                      <p className="mt-1 break-keep text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {f.noticeTitle ?? f.announcementKey}
                      </p>
                    </div>
                  </div>

                  {(f.productFeedback?.CONTRABASS ||
                    f.productFeedback?.VIOLA ||
                    f.productFeedback?.CMP ||
                    f.departmentFeedback) && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {(["CONTRABASS", "VIOLA", "CMP"] as const).map((p) => {
                        const v = f.productFeedback?.[p];
                        if (!v) return null;
                        return (
                          <span
                            key={p}
                            className={`rounded-md px-1.5 py-0.5 ring-1 ring-inset ${RATING_TONE[v]}`}
                          >
                            {p} {RATING_LABEL[v]}
                          </span>
                        );
                      })}
                      {f.departmentFeedback && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 ring-1 ring-inset ${RATING_TONE[f.departmentFeedback]}`}
                        >
                          본부 {RATING_LABEL[f.departmentFeedback]}
                          {f.correctDepartment && ` → ${f.correctDepartment}`}
                        </span>
                      )}
                    </div>
                  )}

                  {f.memo && (
                    <p className="mt-2 whitespace-pre-wrap break-keep text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {f.memo}
                    </p>
                  )}

                  {(f.keywordFeedback ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                      {(f.keywordFeedback ?? [])
                        .filter((k) => k.rating !== "neutral")
                        .map((k) => (
                          <span
                            key={k.keyword}
                            className={`rounded-md px-1.5 py-0.5 ring-1 ring-inset ${RATING_TONE[k.rating]}`}
                          >
                            {k.keyword} {k.rating === "good" ? "👍" : "👎"}
                          </span>
                        ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
