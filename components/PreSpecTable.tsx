"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AttachmentButtons from "@/components/AttachmentButtons";
import type { AnnouncementFeedback } from "@/lib/feedback";
import { getBudgetInfo } from "@/lib/budget";
import { isVerifiedHttpUrl } from "@/lib/preSpec/detailUrl";
import type { PreSpecAnnouncement } from "@/lib/preSpec/types";

/**
 * 사전규격 *내부* 라우트 — /pre-spec/[id].
 *
 * 사용자 정책 (2026-06):
 *  - 공고명 클릭 = *내부 상세페이지* `/pre-spec/[external_id]`. *항상*. 예외 없음.
 *    → 외부 G2B 검색/목록 화면으로 보내지 않는다.
 *    → 규격서 다운로드 링크로도 보내지 않는다.
 *  - 외부 "나라장터 검색" / "나라장터 상세" 는 *별도 보조 버튼*으로만 노출.
 *  - id = preSpecRegNo (= bfSpecRgstNo / external_id) 우선, 없으면 announcementKey 사용.
 */
function buildInternalDetailHref(item: PreSpecAnnouncement): string {
  const id = (item.preSpecRegNo ?? item.announcementKey ?? "").trim();
  if (!id) return "/pre-spec";
  return `/pre-spec/${encodeURIComponent(id)}`;
}

/**
 * 공고명 클릭 시 열 외부 G2B URL 결정.
 *
 * 우선순위:
 *  1) item.detailUrlVerified === true 인 검증된 deep-link (item.detailUrl).
 *  2) item.originalUrl — API 가 raw 로 준 http(s) (예: detailUrl/inqireUrl/url 등 raw 필드).
 *  3) item.searchUrl  — 등록번호가 query 로 박힌 나라장터 사전규격 검색 URL.
 *                       → fallback. 이 경우 사용자에게는 "나라장터 검색" 으로 라벨링.
 *  4) null — 어느 후보도 http(s) 가 아니면 null. 화면은 클릭 비활성 텍스트로 렌더.
 *
 * kind:
 *  - "verified-detail" : 1) 또는 2) 가 채워진 케이스. 라벨 "나라장터 상세보기".
 *  - "regno-search"    : 3) 만 가능한 케이스 (G2B SPA 가 deep-link 미지원). 라벨 "나라장터 검색".
 *  - "none"            : URL 자체가 없음. 클릭 비활성 + 안내.
 *
 * 주의:
 *  - 일반 입찰공고의 buildBidSourceUrl (bidNtceNo / bidNtceOrd 사용) 패턴을 그대로 갖다 쓰지 마라 —
 *    사전규격은 fields/path 가 다르고 G2B link 라우트도 다르기 때문에 *전용 로직* (`lib/preSpec/detailUrl.ts`)
 *    의 산출물(`searchUrl` / `detailUrl`) 만 사용한다.
 */
function resolveExternalLink(item: PreSpecAnnouncement): {
  url: string | null;
  kind: "verified-detail" | "regno-search" | "none";
  label: string;
} {
  const verified = item.detailUrlVerified && isVerifiedHttpUrl(item.detailUrl);
  if (verified) {
    return {
      url: item.detailUrl as string,
      kind: "verified-detail",
      label: "나라장터 상세보기",
    };
  }
  if (isVerifiedHttpUrl(item.originalUrl)) {
    return {
      url: item.originalUrl as string,
      kind: "verified-detail",
      label: "나라장터 상세보기",
    };
  }
  if (isVerifiedHttpUrl(item.searchUrl)) {
    return {
      url: item.searchUrl,
      kind: "regno-search",
      // G2B SPA 가 deep-link 를 공식 지원하지 않아 "검색" 으로 보내는 fallback.
      // 사용자 명시 요구: 라벨은 검증된 상세가 아닌 경우에만 "나라장터 검색".
      label: "나라장터 검색",
    };
  }
  return { url: null, kind: "none", label: "링크 없음" };
}

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
  /** admin 이면 '지금 수집' 안내, 일반 user 는 자동 수집 안내. */
  isAdmin?: boolean;
  /** DB 비어 있음 vs 필터로 숨김 구분. */
  emptyReason?: "no-data" | "filtered";
};

export default function PreSpecTable({
  items,
  savedKeys,
  feedbackMap,
  onToggleSave,
  onOpenFeedback,
  isAdmin = false,
  emptyReason = "no-data",
}: Props) {
  // 토스트 (regno-search fallback 일 때만 클립보드 복사 안내).
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /**
   * "검색" 보조 버튼 클릭 시 등록번호를 클립보드에 복사 (사용자 편의).
   *  - 토스트 메시지는 사용자 친화 톤으로 단순화 ("deep-link" 같은 기술 용어 제거).
   *  - 핸들러는 *클립보드만* 담당 — preventDefault 하지 않고 외부 새 탭은 브라우저가 처리.
   */
  const onClickRegnoSearch = (item: PreSpecAnnouncement) => {
    const query = (item.preSpecRegNo ?? "").trim();
    if (!query) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(query)
        .then(() =>
          setToast(
            `나라장터 검색 페이지를 새 탭으로 엽니다. 등록번호(${query})가 클립보드에 복사되었습니다.`,
          ),
        )
        .catch(() => setToast(`등록번호 ${query} 로 직접 검색해 주세요.`));
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-slate-900/60">
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          표시할 사전규격이 없습니다
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {emptyReason === "filtered"
            ? "현재 필터 조건에 맞는 사전규격이 없습니다. 필터를 조정하거나 \"제외 포함\"을 켜 보세요."
            : isAdmin
              ? "아직 수집된 사전규격공고가 없습니다. 상단 \"지금 수집\"으로 즉시 수집하거나, 자동 수집은 매일 08:30에 실행됩니다."
              : "아직 수집된 사전규격공고가 없습니다. 자동 수집은 매일 08:30에 실행됩니다."}
        </p>
        {emptyReason === "no-data" && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            새로고침은 DB 재조회만 수행하며, 수집을 실행하지 않습니다.
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
              // 외부 G2B 링크 — 공고명 클릭 + 액션 버튼이 공통으로 사용.
              const ext = resolveExternalLink(item);
              const internalHref = buildInternalDetailHref(item);
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
                        {/*
                          공고명 — *항상* 우리 내부 사전규격 상세 페이지 (/pre-spec/[id]) 로 이동.
                          외부 나라장터 URL / 검색 페이지 / 규격서 다운로드 링크에는 절대 연결하지 않는다.
                          (사용자 정책 2026-06 — 검색/목록 화면으로 잘못 안내하면 영업 신뢰 깨짐.)
                        */}
                        <Link
                          href={internalHref}
                          title="CS-G2B 내부 사전규격 상세 페이지로 이동합니다"
                          className="block w-full text-left text-sm font-semibold text-slate-900 underline-offset-2 transition hover:text-blue-700 hover:underline focus:text-blue-700 focus:underline focus:outline-none dark:text-slate-100 dark:hover:text-blue-300 dark:focus:text-blue-300"
                        >
                          {item.isNew && (
                            <span className="mr-1.5 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-amber-400/20 px-2 py-0.5 align-middle text-[11px] font-extrabold text-amber-700 ring-1 ring-inset ring-amber-400/60 dark:text-amber-200 dark:ring-amber-300/60">
                              <span aria-hidden>★</span>
                              <span>신규</span>
                            </span>
                          )}
                          {item.title}
                        </Link>
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
                          {/*
                            "G2B 외부 deep-link" 보조 표시 — verified 인 경우만 노출.
                            "검색 fallback" 같은 운영 메시지는 사용자 화면에서 제거 (관리자 안내는 PreSpecDetailUrlReason 으로 충분).
                          */}
                          {ext.kind === "verified-detail" && (
                            <span
                              title="검증된 G2B 외부 상세 페이지가 있습니다 — 옆의 '나라장터 상세' 버튼 참고"
                              className="whitespace-nowrap rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30"
                            >
                              나라장터 상세 가능
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
                        {/*
                          액션 버튼 (사용자 정책 2026-06):
                            - "상세"   : 우리 내부 사전규격 상세 (/pre-spec/[id]) — 공고명 클릭과 동일한 destination.
                            - "G2B ↗" : 검증된 외부 deep-link 가 있을 때만 (indigo).
                            - "검색"   : 나라장터 사전규격공고 검색 페이지 (sky) — 검증과 무관하게 항상 보조 버튼.
                          ★ 공고명 클릭 / "상세" 는 *내부* 페이지로만 이동하며, 외부 G2B 와 명확히 분리됨.
                        */}
                        <Link
                          href={internalHref}
                          title="CS-G2B 내부 사전규격 상세 페이지로 이동"
                          className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-blue-600 px-2 text-[11px] font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500"
                        >
                          상세
                        </Link>
                        {ext.kind === "verified-detail" && ext.url && (
                          <a
                            href={ext.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="검증된 G2B 외부 상세 페이지를 새 탭으로 엽니다"
                            className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-indigo-600 px-2 text-[11px] font-semibold text-white transition hover:bg-indigo-700 dark:bg-indigo-500"
                          >
                            G2B ↗
                          </a>
                        )}
                        {/*
                          "나라장터 검색" 보조 버튼 — searchUrl 이 있을 때 항상 노출.
                          public 사용자에게는 "검색 fallback" 같은 기술 용어를 절대 노출하지 않는다.
                        */}
                        {isVerifiedHttpUrl(item.searchUrl) && (
                          <a
                            href={item.searchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => onClickRegnoSearch(item)}
                            title="나라장터 사전규격공고 검색 페이지를 새 탭으로 엽니다 (등록번호 자동 복사)"
                            className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-sky-600 px-2 text-[11px] font-semibold text-white transition hover:bg-sky-700 dark:bg-sky-500"
                          >
                            검색
                          </a>
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
                    {item.attachments && item.attachments.length > 0 ? (
                      // RFP / 규격서 / 과업 / 첨부 N 묶음 — 사전규격은 규격서 강조.
                      <AttachmentButtons attachments={item.attachments} emphasizeSpec compact />
                    ) : (() => {
                      // attachments 추출이 비어 있을 때의 legacy 폴백 (specDocFileUrl1~5).
                      // 캐시/데이터에 무엇이 들어 있더라도 반드시 http(s) 검증 후에만 링크 노출.
                      const legacy = item.attachmentUrl ?? item.specFileUrl ?? item.fileUrl;
                      if (isVerifiedHttpUrl(legacy)) {
                        return (
                          <a
                            href={legacy}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="규격서 첨부파일을 새 탭으로 엽니다 (공고명 클릭과는 별개)"
                            className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-cyan-600 px-2 text-[11px] font-semibold text-white transition hover:bg-cyan-700 dark:bg-cyan-500"
                          >
                            규격서 ↗
                          </a>
                        );
                      }
                      return (
                        <span className="inline-flex h-7 cursor-not-allowed items-center justify-center whitespace-nowrap rounded-md bg-slate-100 px-2 text-[11px] font-medium text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                          파일없음
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    {/* 검색 fallback 시 클립보드 복사 안내 toast — 화면 우하단 고정, 자동 사라짐. */}
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
