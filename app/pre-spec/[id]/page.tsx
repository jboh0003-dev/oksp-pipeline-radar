"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import AttachmentButtons from "@/components/AttachmentButtons";
import { getBudgetInfo } from "@/lib/budget";
import { isVerifiedHttpUrl } from "@/lib/preSpec/detailUrl";
import type {
  PreSpecAnnouncement,
  PreSpecCustomer,
} from "@/lib/preSpec/types";

/**
 * CS-G2B 내부 사전규격 상세 페이지.
 *
 * 라우트: /pre-spec/[id]   (id = 사전규격등록번호 = external_id)
 *
 * 데이터 소스 우선순위:
 *  1) localStorage `csg2b:preSpec:items.v2` 캐시 — 목록 → 클릭 흐름에서는 항상 hit.
 *  2) `/api/pre-spec/[id]` — DB 의 pre_spec_notices 에서 조회 + raw_data 위에 매칭 재계산.
 *  3) 둘 다 실패 → "데이터 없음 — 수집을 먼저 실행해 주세요" 안내.
 *
 * 정책 (사용자 요청):
 *  - 공고명/제목 클릭은 *우리 내부 페이지로만* 이동 → 이 화면이 그 종착지다.
 *  - 나라장터 외부 deep-link 는 검증된 경우(detailUrlVerified=true)에만 별도 "G2B 상세" 버튼으로 노출.
 *  - 검증 안 된 검색/목록 URL 은 별도 "나라장터 검색" 버튼으로만 제공 (제목 클릭과 분리).
 *  - 규격서 첨부는 별도 "규격서" 버튼으로 분리 — 제목 클릭이 다운로드가 되지 않게.
 */

const PRE_SPEC_CACHE_KEY = "csg2b:preSpec:items.v2";

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

type DetailApiResponse = {
  ok: boolean;
  item?: PreSpecAnnouncement;
  error?: string;
  notFound?: boolean;
  source?: string;
  meta?: { insertedAt?: string | null; updatedAt?: string | null };
};

/** 캐시에서 external_id / preSpecRegNo / announcementKey 가 일치하는 첫 항목 검색. */
function findInLocalCache(id: string): PreSpecAnnouncement | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRE_SPEC_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    for (const it of parsed as PreSpecAnnouncement[]) {
      if (!it || typeof it !== "object") continue;
      if (it.preSpecRegNo === id || it.announcementKey === id) {
        return it;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export default function PreSpecDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 16 App Router: params 는 Promise 라 client 컴포넌트는 use() 로 unwrap.
  const { id: rawId } = use(params);
  const id = decodeURIComponent(rawId ?? "");

  const [item, setItem] = useState<PreSpecAnnouncement | null>(null);
  const [source, setSource] = useState<"cache" | "db" | "db-no-raw" | "db-normalize-failed" | null>(
    null,
  );
  const [meta, setMeta] = useState<DetailApiResponse["meta"]>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  // 1) 캐시 hit 시 즉시 페인트, 2) 동시에 API 도 호출해 최신화 (캐시-then-network).
  // setState 호출은 모두 async load() 내부로 모아 react-hooks/set-state-in-effect 룰 회피.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setError(null);
      setIsLoading(true);

      const cached = findInLocalCache(id);
      if (cached && !cancelled) {
        setItem(cached);
        setSource("cache");
        setIsLoading(false);
      }

      try {
        const res = await fetch(`/api/pre-spec/${encodeURIComponent(id)}`, {
          method: "GET",
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as DetailApiResponse;
          if (!cached) {
            setError(json.error ?? `상세 조회 실패 (HTTP ${res.status})`);
            setIsLoading(false);
          }
          return;
        }
        const json = (await res.json()) as DetailApiResponse;
        if (cancelled) return;
        if (json.ok && json.item) {
          setItem(json.item);
          setSource(
            (json.source as "db" | "db-no-raw" | "db-normalize-failed") ?? "db",
          );
          setMeta(json.meta);
          setError(null);
        } else if (!cached) {
          setError(json.error ?? "상세 데이터를 찾지 못했습니다.");
        }
      } catch (e) {
        if (cancelled) return;
        if (!cached) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // 사용자/담당본부 매칭 — 상세에서도 표시. (목록과 동일하게 /api/customer-accounts/match 호출.)
  // setState 호출은 모두 async load() 내부로 모아 react-hooks/set-state-in-effect 룰 회피.
  const [customer, setCustomer] = useState<PreSpecCustomer | null>(null);
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    const load = async () => {
      if (item.customer) {
        if (!cancelled) setCustomer(item.customer);
        return;
      }
      const agencies = [item.orgName, item.demandOrgName ?? ""]
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== "(기관 미상)");
      if (agencies.length === 0) return;
      try {
        const res = await fetch("/api/customer-accounts/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agencies }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          matches?: Record<
            string,
            {
              customerName: string;
              accountType: string | null;
              territory: string | null;
              regionGroup: string | null;
              region: string | null;
              matchType: string;
            }
          >;
        };
        const m =
          (item.orgName && json.matches?.[item.orgName]) ||
          (item.demandOrgName && json.matches?.[item.demandOrgName]) ||
          undefined;
        if (cancelled || !m) return;
        setCustomer({
          customerName: m.customerName,
          territory: m.territory ?? "미매칭",
          accountType: m.accountType ?? "-",
          region: m.region,
          regionGroup: m.regionGroup,
        });
      } catch {
        // 매칭 실패는 조용히 무시 — 상세 화면 자체에는 영향 없음.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [item]);

  // 화면 표시용 파생값.
  const budget = useMemo(
    () => (item ? getBudgetInfo(String(item.budget || "")) : null),
    [item],
  );
  const matchedKeywords = item?.matchedKeywords ?? [];
  const products = item?.products ?? [];
  const productScores = item?.productScores ?? {};
  const totalScore = useMemo(
    () =>
      Object.values(productScores).reduce(
        (sum, v) => sum + (typeof v === "number" ? v : 0),
        0,
      ),
    [productScores],
  );

  if (isLoading && !item) {
    return (
      <div className="min-h-full">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 md:max-w-[1200px] md:px-6">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-slate-900/60">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              사전규격 상세를 불러오는 중…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-full">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 md:max-w-[1200px] md:px-6">
          <BackToList />
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-12 text-center dark:border-rose-400/30 dark:bg-rose-500/10">
            <p className="text-base font-semibold text-rose-800 dark:text-rose-200">
              사전규격 데이터를 찾을 수 없습니다
            </p>
            <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">
              {error ??
                "해당 사전규격(등록번호) 데이터가 없습니다. 사전규격 수집을 먼저 실행한 뒤 다시 시도해 주세요."}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Link
                href="/pre-spec"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500"
              >
                사전규격 목록으로
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // detailUrlVerified 가 true 일 때만 외부 G2B 상세 버튼 노출.
  const hasVerifiedG2bDetail =
    Boolean(item.detailUrlVerified) && isVerifiedHttpUrl(item.detailUrl ?? undefined);

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 md:max-w-[1200px] md:px-6">
        <BackToList />

        {/* 헤더 — 상태 / 추천 / 제품 / 사업명 */}
        <header className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/60 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_BADGE[item.status] ?? STATUS_BADGE["확인필요"]}`}
            >
              {item.status}
            </span>
            <span
              className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${RECOMMENDATION_BADGE[item.recommendation] ?? RECOMMENDATION_BADGE["참고"]}`}
            >
              {item.recommendation}
            </span>
            {products.map((p) => (
              <span
                key={p}
                className="whitespace-nowrap rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200/70 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/30"
              >
                {p}
              </span>
            ))}
            {item.bsnsDivLabel && (
              <span className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                {item.bsnsDivLabel}
              </span>
            )}
            {item.linkedBidNo && (
              <span className="whitespace-nowrap rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
                입찰연결 · {item.linkedBidNo}
              </span>
            )}
          </div>

          <h1 className="mt-3 break-keep text-xl font-bold leading-snug text-slate-900 dark:text-slate-100 sm:text-2xl">
            {item.title}
          </h1>
          {item.businessName && item.businessName !== item.title && (
            <p className="mt-1 break-keep text-sm text-slate-600 dark:text-slate-400">
              {item.businessName}
            </p>
          )}

          <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span className="rounded-md bg-slate-50 px-1.5 py-0.5 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:ring-white/10">
              사전규격등록번호 · {item.preSpecRegNo ?? id}
            </span>
            {source && (
              <span
                title={
                  source === "cache"
                    ? "브라우저 localStorage 캐시에서 즉시 표시 — 백그라운드로 DB 최신화 중"
                    : source === "db"
                      ? "DB pre_spec_notices 에서 raw_data 위에 매칭 재계산"
                      : source === "db-no-raw"
                        ? "DB 에 raw_data 가 없어 매칭 결과 재계산 불가 — 수집을 다시 실행하면 채워짐"
                        : "DB normalize 실패 — minimal 데이터만 표시"
                }
                className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                  source === "cache"
                    ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/30"
                    : source === "db-no-raw" || source === "db-normalize-failed"
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30"
                      : "bg-slate-50 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-white/10"
                }`}
              >
                source · {source}
              </span>
            )}
            {meta?.updatedAt && (
              <span className="text-slate-400 dark:text-slate-500">
                DB 갱신 {new Date(meta.updatedAt).toLocaleString("ko-KR")}
              </span>
            )}
          </p>

          {/* 액션 버튼: 규격서 / G2B 상세 (verified) / 나라장터 검색 — 모두 보조 액션. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {item.attachments && item.attachments.length > 0 ? (
              <AttachmentButtons attachments={item.attachments} emphasizeSpec />
            ) : isVerifiedHttpUrl(item.attachmentUrl ?? item.specFileUrl) ? (
              <a
                href={item.attachmentUrl ?? item.specFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="규격서 첨부파일을 새 탭으로 엽니다"
                className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-cyan-600 px-3 text-sm font-semibold text-white shadow-sm ring-2 ring-cyan-300/60 hover:bg-cyan-700 dark:bg-cyan-500 dark:ring-cyan-300/40"
              >
                규격서 ↗
              </a>
            ) : (
              <span className="inline-flex h-9 cursor-not-allowed items-center justify-center whitespace-nowrap rounded-md bg-slate-100 px-3 text-sm font-medium text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                규격서 없음
              </span>
            )}

            {hasVerifiedG2bDetail && (
              <a
                href={item.detailUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                title="검증된 G2B 사전규격 상세 페이지로 이동합니다"
                className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500"
              >
                G2B 상세 ↗
              </a>
            )}

            {isVerifiedHttpUrl(item.searchUrl) && (
              <a
                href={item.searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  hasVerifiedG2bDetail
                    ? "나라장터 사전규격 검색 페이지를 새 탭으로 엽니다"
                    : "나라장터 SPA 가 직접 진입 deep-link 를 지원하지 않아 검색 페이지를 열고 등록번호로 검색합니다"
                }
                className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500"
              >
                나라장터 검색 ↗
              </a>
            )}
          </div>
        </header>

        {/* 본문 — 좌우 2단 (mobile 1단). */}
        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 좌측: 핵심 메타 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/60 lg:col-span-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              핵심 정보
            </h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <DefField label="공고기관" value={item.orgName} />
              <DefField
                label="수요기관"
                value={
                  item.demandOrgName && item.demandOrgName !== item.orgName
                    ? item.demandOrgName
                    : null
                }
              />
              <DefField label="업무구분" value={item.bsnsDivLabel ?? null} />
              <DefField
                label="배정예산"
                value={
                  budget?.amount != null
                    ? `${budget.korean ?? ""} (${budget.formatted ?? ""})`
                        .replace("(  )", "")
                        .replace("()", "")
                        .replace(" ()", "")
                    : "예산 미공개"
                }
                emphasize={budget?.amount != null}
              />
              <DefField label="공개일" value={item.openDate ?? null} />
              <DefField
                label="의견마감"
                value={item.opinionDeadline ?? null}
                emphasize={item.status === "마감임박"}
              />
              <DefField label="원본 파일명" value={item.fileName ?? null} />
              <DefField
                label="입찰 연결"
                value={item.linkedBidNo ?? null}
              />
            </dl>
          </div>

          {/* 우측: 영업 매칭 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              영업 매칭
            </h2>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                  담당본부
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                  {customer?.territory ?? item.department ?? "미매칭"}
                </p>
                {customer?.customerName && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {customer.customerName}
                    {customer.accountType && customer.accountType !== "-" && (
                      <span className="ml-1 text-slate-400">· {customer.accountType}</span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                  제품 매칭
                </p>
                {products.length > 0 ? (
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {products.map((p) => (
                      <span
                        key={p}
                        className="whitespace-nowrap rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200/70 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/30"
                      >
                        {p}
                        {productScores[p] != null && (
                          <span className="ml-1 font-mono text-[10px] text-indigo-500 dark:text-indigo-400">
                            {productScores[p]}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    매칭 0건
                  </p>
                )}
                {totalScore > 0 && (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    합산 점수 <span className="font-bold tabular-nums">{totalScore}</span>
                    {item.matchReason && (
                      <span className="ml-1 text-slate-400">· {item.matchReason}</span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                  매칭 키워드
                </p>
                {matchedKeywords.length > 0 ? (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {matchedKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    매칭된 키워드 없음
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 부가 정보 — 첨부 / SW사업대상 / 참조번호 등 */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            첨부 / 부가 정보
          </h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <DefField label="첨부 파일 수" value={String(item.attachments?.length ?? 0)} />
            <DefField label="규격서 포함" value={item.hasSpecDoc ? "있음" : "없음"} />
            <DefField label="RFP 포함" value={item.hasRfp ? "있음" : "없음"} />
            <DefField label="과업지시서 포함" value={item.hasTaskDoc ? "있음" : "없음"} />
            <DefField
              label="SW사업대상"
              value={pickRawString(item.raw, ["swBizObjYn", "swbizTgYn"]) ?? "-"}
            />
            <DefField
              label="참조번호"
              value={pickRawString(item.raw, ["refNo"]) ?? "-"}
            />
            <DefField
              label="담당자"
              value={
                [
                  pickRawString(item.raw, ["ofclNm", "ntceMgrName"]),
                  pickRawString(item.raw, ["ofclTelNo", "ntceMgrTelNo"]),
                ]
                  .filter(Boolean)
                  .join(" · ") || "-"
              }
            />
            <DefField
              label="납품/완수기한"
              value={pickRawString(item.raw, ["dlvrTmlmtDt", "deliveryDeadline"]) ?? "-"}
            />
            <DefField
              label="규격서 의견 수"
              value={pickRawString(item.raw, ["specOpnnRgstCnt", "opnnCnt"]) ?? "-"}
            />
            <DefField
              label="API endpoint"
              value={item.sourceEndpoint ?? "-"}
              mono
            />
          </dl>
          {item.attachments && item.attachments.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/5">
              <p className="text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                첨부 목록
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {item.attachments.map((a, i) => (
                  <li
                    key={`${a.name}-${i}`}
                    className="flex items-center gap-2 break-all text-slate-700 dark:text-slate-300"
                  >
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                      {a.type}
                    </span>
                    {a.url && isVerifiedHttpUrl(a.url) ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
                      >
                        {a.name}
                      </a>
                    ) : (
                      <span>{a.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* raw_data 펼치기 — 디버그/관리자 확인용 */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={() => setShowRaw((p) => !p)}
            className="text-sm font-semibold text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
          >
            {showRaw ? "▾ raw_data 접기" : "▸ raw_data 펼치기"}
          </button>
          {showRaw && (
            <pre className="mt-3 max-h-[480px] overflow-auto rounded-md bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:ring-white/10">
              {JSON.stringify(item.raw ?? {}, null, 2)}
            </pre>
          )}
        </section>

        <div className="mt-6">
          <BackToList />
        </div>
      </div>
    </div>
  );
}

function BackToList() {
  return (
    <Link
      href="/pre-spec"
      className="inline-flex h-8 items-center justify-center rounded-md bg-white px-3 text-xs font-semibold text-blue-600 ring-1 ring-blue-200 transition hover:bg-blue-50 dark:bg-slate-900/60 dark:text-blue-300 dark:ring-blue-400/30 dark:hover:bg-slate-800"
    >
      ← 사전규격 목록
    </Link>
  );
}

function DefField({
  label,
  value,
  emphasize,
  mono,
}: {
  label: string;
  value: string | null;
  emphasize?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 break-keep text-sm ${
          emphasize
            ? "font-bold text-rose-700 dark:text-rose-300"
            : "text-slate-900 dark:text-slate-100"
        } ${mono ? "font-mono text-[12px]" : ""}`}
      >
        {value ?? <span className="text-slate-400 dark:text-slate-500">-</span>}
      </dd>
    </div>
  );
}

/** raw 객체에서 첫 번째로 채워진 문자열 후보 반환 (사전규격 응답 변종 대응). */
function pickRawString(
  raw: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  if (!raw) return null;
  for (const k of keys) {
    const v = raw[k];
    if (v == null) continue;
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length > 0) return s;
    } else if (typeof v === "number") {
      return String(v);
    }
  }
  return null;
}
