"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Notice } from "@/data/sampleNotices";
import { CONTRABASS_FAMILY } from "@/data/sampleNotices";
import {
  type AnnouncementFeedback,
  type FeedbackRating,
  type KeywordFeedback,
  loadLastAuthor,
  saveFeedback,
  saveLastAuthor,
} from "@/lib/feedback";

const CONTRABASS_FAMILY_SET = new Set<string>(CONTRABASS_FAMILY);

const DEPARTMENT_OPTIONS = ["공공", "금융", "커머셜", "광역", "미매칭"];

const RATING_LABEL: Record<FeedbackRating, string> = {
  good: "좋음",
  neutral: "애매함",
  bad: "나쁨",
};

const RATING_TONE: Record<
  FeedbackRating,
  { active: string; idle: string }
> = {
  good: {
    active:
      "bg-emerald-600 text-white ring-1 ring-emerald-500 dark:bg-emerald-500 dark:ring-emerald-400",
    idle:
      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30 dark:hover:bg-emerald-500/20",
  },
  neutral: {
    active:
      "bg-slate-600 text-white ring-1 ring-slate-500 dark:bg-slate-500 dark:ring-slate-400",
    idle:
      "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-700/60",
  },
  bad: {
    active:
      "bg-rose-600 text-white ring-1 ring-rose-500 dark:bg-rose-500 dark:ring-rose-400",
    idle:
      "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30 dark:hover:bg-rose-500/20",
  },
};

type Props = {
  /** 모달이 열려있는지. false 면 unmount 되어 SSR 안전. */
  open: boolean;
  /** 피드백 대상 공고. */
  notice: Notice;
  /** 공고 unique key — 저장 ID. */
  announcementKey: string;
  /** 기존 피드백(있으면 폼 초기값). */
  existing?: AnnouncementFeedback;
  /** 저장 직후 부모에 갱신된 전체 list 전달. */
  onSaved: (list: AnnouncementFeedback[]) => void;
  onClose: () => void;
};

/**
 * 공고 1건에 대한 피드백 입력 모달.
 *
 * 섹션:
 *  1) 공고 기본정보 (읽기 전용)
 *  2) 전체 평가 (good / neutral / bad)
 *  3) 제품별 평가 (해당 공고의 relatedProducts 에 포함된 제품만 노출)
 *  4) 담당본부 평가 + 정정값(틀렸을 때)
 *  5) 키워드별 평가 (현재 매칭된 키워드 chip + 옆에 👍/👎 토글)
 *  6) 자유 메모
 *  7) 작성자 (lastAuthor 자동 채움)
 */
export default function FeedbackModal({
  open,
  notice,
  announcementKey,
  existing,
  onSaved,
  onClose,
}: Props) {
  const [rating, setRating] = useState<FeedbackRating>("neutral");
  const [contrabass, setContrabass] = useState<FeedbackRating | undefined>();
  const [viola, setViola] = useState<FeedbackRating | undefined>();
  const [department, setDepartment] = useState<FeedbackRating | undefined>();
  const [correctDepartment, setCorrectDepartment] = useState<string>("");
  const [keywordRatings, setKeywordRatings] = useState<KeywordFeedback[]>([]);
  const [memo, setMemo] = useState<string>("");
  const [author, setAuthor] = useState<string>("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const hasContrabass = useMemo(
    () => notice.relatedProducts.some((p) => CONTRABASS_FAMILY_SET.has(p)),
    [notice.relatedProducts],
  );
  const hasViola = useMemo(
    () => notice.relatedProducts.includes("VIOLA"),
    [notice.relatedProducts],
  );

  /** 모달이 새로 열릴 때 폼을 existing 또는 디폴트로 초기화. */
  useEffect(() => {
    if (!open) return;
    setRating(existing?.rating ?? "neutral");
    setContrabass(existing?.productFeedback?.CONTRABASS);
    setViola(existing?.productFeedback?.VIOLA);
    setDepartment(existing?.departmentFeedback);
    setCorrectDepartment(existing?.correctDepartment ?? "");
    const baseKeywords = Array.from(
      new Set((notice.keywords ?? []).filter(Boolean)),
    );
    const existingKw = new Map(
      (existing?.keywordFeedback ?? []).map((kw) => [kw.keyword, kw.rating]),
    );
    setKeywordRatings(
      baseKeywords.map((kw) => ({
        keyword: kw,
        rating: existingKw.get(kw) ?? "neutral",
      })),
    );
    setMemo(existing?.memo ?? "");
    setAuthor(existing?.author ?? loadLastAuthor());
  }, [open, existing, notice.keywords]);

  /** ESC 키로 닫기 + 바디 스크롤 잠금. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleKeywordRating = (keyword: string, rating: FeedbackRating) => {
    setKeywordRatings((prev) =>
      prev.map((kw) => (kw.keyword === keyword ? { ...kw, rating } : kw)),
    );
  };

  const handleSave = () => {
    if (author.trim()) saveLastAuthor(author);
    const next = saveFeedback({
      announcementKey,
      noticeId: notice.id,
      noticeTitle: notice.title,
      rating,
      productFeedback: {
        ...(contrabass ? { CONTRABASS: contrabass } : {}),
        ...(viola ? { VIOLA: viola } : {}),
      },
      departmentFeedback: department,
      correctDepartment: correctDepartment.trim() || undefined,
      // "그대로(neutral) + 메모 없음" 같은 의미 없는 키워드는 굳이 저장하지 않아도 되지만
      // 단순함을 위해 전부 저장 — CSV 내보낼 때 의도가 보존됨.
      keywordFeedback: keywordRatings,
      memo: memo.trim(),
      author: author.trim() || undefined,
    });
    onSaved(next);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6 backdrop-blur-sm"
      onClick={(e) => {
        // 배경 클릭 시에만 닫기 — 컨텐츠 영역 클릭은 차단.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10"
      >
        {/* 헤더 */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
              공고 피드백
            </p>
            <h2
              id="feedback-modal-title"
              className="mt-0.5 break-keep text-lg font-bold text-slate-900 dark:text-slate-50"
              title={notice.title}
            >
              {notice.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {notice.agency}
              {notice.customer?.territory && (
                <span className="ml-1.5 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  {notice.customer.territory}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* 1) 공고 기본정보 — 메타 chip */}
        <div className="mb-5 flex flex-wrap gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px] dark:bg-slate-800/40">
          {notice.relatedProducts.length > 0 && (
            <span className="text-slate-500 dark:text-slate-400">
              제품:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {Array.from(
                  new Set(
                    notice.relatedProducts.map((p) =>
                      CONTRABASS_FAMILY_SET.has(p) ? "CONTRABASS" : p,
                    ),
                  ),
                ).join(", ")}
              </span>
            </span>
          )}
          {notice.deadline && (
            <span className="text-slate-500 dark:text-slate-400">
              · 마감{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {notice.deadline.slice(0, 10)}
              </span>
            </span>
          )}
          {notice.customer?.customerName && (
            <span className="text-slate-500 dark:text-slate-400">
              · 매칭:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {notice.customer.customerName}
              </span>
            </span>
          )}
        </div>

        {/* 2) 전체 평가 */}
        <Section label="전체 평가">
          <RatingPicker value={rating} onChange={setRating} />
        </Section>

        {/* 3) 제품별 평가 — 매칭된 제품만 노출 */}
        {(hasContrabass || hasViola) && (
          <Section label="제품 매칭 평가">
            <div className="space-y-2">
              {hasContrabass && (
                <ProductRow
                  label="CONTRABASS"
                  value={contrabass}
                  onChange={setContrabass}
                />
              )}
              {hasViola && (
                <ProductRow
                  label="VIOLA"
                  value={viola}
                  onChange={setViola}
                />
              )}
            </div>
          </Section>
        )}

        {/* 4) 담당본부 평가 */}
        <Section label="담당본부 매칭">
          <RatingPicker
            value={department}
            onChange={setDepartment}
            allowClear
          />
          {(department === "bad" || department === "neutral") && (
            <div className="mt-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400">
                올바른 본부
              </label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {DEPARTMENT_OPTIONS.map((dept) => {
                  const active = correctDepartment === dept;
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() =>
                        setCorrectDepartment((prev) =>
                          prev === dept ? "" : dept,
                        )
                      }
                      className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold transition ${
                        active
                          ? "bg-blue-600 text-white ring-1 ring-blue-500 dark:bg-blue-500"
                          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-700/60"
                      }`}
                    >
                      {dept}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        {/* 5) 키워드별 평가 */}
        {keywordRatings.length > 0 && (
          <Section label="매칭 키워드 평가">
            <div className="flex flex-col gap-1.5">
              {keywordRatings.map((kw) => (
                <div
                  key={kw.keyword}
                  className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 dark:bg-slate-800/40"
                >
                  <span className="truncate text-xs text-slate-700 dark:text-slate-200">
                    {kw.keyword}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    {(["good", "bad"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleKeywordRating(kw.keyword, r)}
                        className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold transition ${
                          kw.rating === r
                            ? RATING_TONE[r].active
                            : RATING_TONE[r].idle
                        }`}
                      >
                        {r === "good" ? "👍 좋음" : "👎 별로"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 6) 메모 */}
        <Section label="메모">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 가상화 키워드는 맞지만 실제 사업 범위가 단순 장비 교체라 우선순위는 낮아 보임"
            rows={3}
            className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/30"
          />
        </Section>

        {/* 7) 작성자 */}
        <Section label="작성자">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="작성자 이름"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/30 sm:max-w-xs"
          />
        </Section>

        {/* 액션 */}
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-white/5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            피드백 저장
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function RatingPicker({
  value,
  onChange,
  allowClear,
}: {
  value: FeedbackRating | undefined;
  onChange: (next: FeedbackRating) => void;
  allowClear?: boolean;
}) {
  const options: FeedbackRating[] = ["good", "neutral", "bad"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => {
              // allowClear=true 일 때는 같은 옵션을 다시 누르면 neutral 로 되돌린다.
              // (전체 평가는 항상 값이 있어야 하므로 clear 대신 neutral 로 reset.)
              if (allowClear && active) onChange("neutral");
              else onChange(opt);
            }}
            className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition ${
              active ? RATING_TONE[opt].active : RATING_TONE[opt].idle
            }`}
          >
            {RATING_LABEL[opt]}
          </button>
        );
      })}
    </div>
  );
}

function ProductRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FeedbackRating | undefined;
  onChange: (next: FeedbackRating) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/40">
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <RatingPicker value={value} onChange={onChange} allowClear />
    </div>
  );
}
