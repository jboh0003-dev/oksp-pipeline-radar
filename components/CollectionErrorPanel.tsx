"use client";

import { useState } from "react";
import {
  getCollectionErrorKindLabel,
  summarizeErrors,
  type CollectionError,
  type CollectionErrorKind,
} from "@/lib/collectionErrors";

const KIND_BADGE: Record<CollectionErrorKind, string> = {
  API_KEY_MISSING:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30",
  API_TIMEOUT:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
  API_RESPONSE_ERROR:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30",
  JSON_PARSE_ERROR:
    "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30",
  EMPTY_ITEMS:
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-white/10",
  ATTACHMENT_URL_ERROR:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30",
  NORMALIZE_ERROR:
    "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30",
  UNKNOWN_ERROR:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30",
};

type Props = {
  /**
   * 표시할 오류 목록. 비어 있으면 컴포넌트 자체가 렌더되지 않는다.
   * 호출부는 이미 dedup / 합쳐서 넘겨주는 것이 깔끔하다.
   */
  errors: CollectionError[];
  /** 작은 라벨 텍스트. 기본 "수집 오류". */
  title?: string;
};

/**
 * 수집 오류 패널.
 *
 *  - 오류가 0건이면 아무것도 그리지 않는다.
 *  - 1건 이상이면 상단 배너로 "수집 오류 N건" 표시 + 펼치면 상세 목록.
 *  - 상세는 endpoint / 페이지 / 메시지 / 시각을 모두 노출 (내부 팀 도구이므로 디테일 노출 OK).
 */
export default function CollectionErrorPanel({ errors, title }: Props) {
  const [open, setOpen] = useState(false);
  if (!errors || errors.length === 0) return null;

  const { byKind, byEndpoint } = summarizeErrors(errors);
  const label = title ?? "수집 오류";

  return (
    <section
      role="status"
      aria-live="polite"
      className="mb-3 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs shadow-sm dark:border-rose-400/30 dark:bg-rose-500/10 sm:text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-rose-800 dark:text-rose-200">
          ⚠ {label} {errors.length}건
        </span>
        <span className="hidden text-[11px] text-rose-700/80 dark:text-rose-300/80 sm:inline">
          가능한 데이터는 그대로 표시됩니다.
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen((p) => !p)}
            className="inline-flex h-7 items-center justify-center rounded-md bg-white px-2 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 dark:bg-slate-900/70 dark:text-rose-200 dark:ring-rose-400/30"
          >
            {open ? "▾ 접기" : "▸ 자세히"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(byKind).map(([kind, count]) => (
              <span
                key={kind}
                className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                  KIND_BADGE[kind as CollectionErrorKind] ?? KIND_BADGE.UNKNOWN_ERROR
                }`}
              >
                {getCollectionErrorKindLabel(kind as CollectionErrorKind)} · {count}
              </span>
            ))}
            {Object.entries(byEndpoint).map(([ep, count]) => (
              <span
                key={`ep-${ep}`}
                className="inline-flex items-center whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-mono text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-300 dark:ring-white/10"
              >
                {ep} · {count}
              </span>
            ))}
          </div>
          <ul className="max-h-64 list-disc space-y-1 overflow-y-auto rounded-md bg-white px-3 py-2 pl-5 dark:bg-slate-900/60">
            {errors.slice(0, 80).map((err, index) => (
              <li
                key={`${err.id}|${err.endpoint ?? ""}|${err.createdAt}|${index}`}
                className="text-[11px] leading-5"
              >
                <span
                  className={`mr-1 inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                    KIND_BADGE[err.kind] ?? KIND_BADGE.UNKNOWN_ERROR
                  }`}
                >
                  {getCollectionErrorKindLabel(err.kind)}
                </span>
                {err.endpoint && (
                  <span className="mr-1 font-mono text-slate-500 dark:text-slate-400">
                    {err.endpoint}
                    {err.pageNo != null ? `/p${err.pageNo}` : ""}
                  </span>
                )}
                <span className="break-all text-slate-700 dark:text-slate-200">{err.message}</span>
                {err.detail && (
                  <span className="ml-1 break-all font-mono text-[10px] text-slate-400 dark:text-slate-500">
                    · {err.detail.length > 200 ? `${err.detail.slice(0, 200)}…` : err.detail}
                  </span>
                )}
              </li>
            ))}
            {errors.length > 80 && (
              <li className="text-[11px] text-slate-500 dark:text-slate-400">
                ... 외 {errors.length - 80}건 (생략)
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
