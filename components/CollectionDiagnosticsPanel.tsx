"use client";

/**
 * 관리자 전용 "수집 진단" 패널.
 *
 * 화면 어디에서 시간을 끌고 오는지, 자동수집이 도는지/안 도는지를 직관적으로 보여준다:
 *  - 마지막 시도(any) : 가장 최근 collection_runs row (성공/실패 무관)
 *  - 마지막 성공     : ok=true 인 가장 최근 row
 *  - source / mode  : cron 인지 manual 인지
 *  - 오류 메시지     : 마지막 시도가 실패면 errors[0]
 *  - run id          : Supabase 에서 직접 row 를 찾을 수 있도록 노출
 *  - 자동수집 일정   : 매일 08:30 KST (vercel.json 기준)
 *  - 환경 점검       : /api/collect-now GET 으로 env / supabase 접근 상태 진단
 *
 * 일반 사용자에겐 보이지 않는다. (app/page.tsx 에서 useAuth().isAdmin 으로 가드)
 */

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import {
  formatRelativeKstAgo,
  isIsoStaleSinceMorningCutoff,
  parseIsoToMs,
} from "@/lib/freshness";
import type { CollectionRunRow } from "@/lib/supabase";

type EnvProbe = {
  ready: boolean;
  missingEnv: string[];
  isRunning: boolean;
  cooldownRemainingMs: number;
  collectionRunsAccessible: boolean;
  collectionRunsError: string | null;
};

type Props = {
  /** 마지막 시도 (success or fail 무관). app/page.tsx 의 lastRun 와 동일. */
  lastAttempt: CollectionRunRow | null;
  /** 마지막 성공 (ok=true). lastAttempt 와 동일할 수도 있고 더 과거일 수도 있다. */
  lastSuccess: CollectionRunRow | null;
  /** Supabase 조회 자체가 실패한 경우. */
  fetchError: string | null;
};

const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

function formatKstFull(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return KST_FORMATTER.format(date);
}

function classifySource(source: string | null | undefined): {
  label: string;
  tone: "auto" | "manual" | "unknown";
} {
  if (!source) return { label: "unknown", tone: "unknown" };
  if (source.startsWith("manual:")) return { label: source, tone: "manual" };
  if (source.startsWith("cron:")) return { label: source, tone: "auto" };
  return { label: source, tone: "unknown" };
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-tight">
      <span className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words text-xs text-slate-700 dark:text-slate-200">
        {children}
      </span>
    </div>
  );
}

export default function CollectionDiagnosticsPanel({
  lastAttempt,
  lastSuccess,
  fetchError,
}: Props) {
  const [envProbe, setEnvProbe] = useState<EnvProbe | null>(null);
  const [envProbeError, setEnvProbeError] = useState<string | null>(null);
  const [envProbeLoading, setEnvProbeLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const refreshProbe = async () => {
    setEnvProbeLoading(true);
    try {
      const res = await authedFetch("/api/collect-now", { method: "GET" });
      if (!res.ok) {
        setEnvProbe(null);
        setEnvProbeError(`HTTP ${res.status}`);
      } else {
        const json = (await res.json()) as EnvProbe;
        setEnvProbe(json);
        setEnvProbeError(null);
      }
    } catch (err) {
      setEnvProbe(null);
      setEnvProbeError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnvProbeLoading(false);
    }
  };

  useEffect(() => {
    void refreshProbe();
  }, []);

  const lastSource = classifySource(lastAttempt?.source);
  const lastSuccessSource = classifySource(lastSuccess?.source);
  const lastSuccessStale = isIsoStaleSinceMorningCutoff(
    lastSuccess?.finished_at ?? null,
  );

  const hasEverSucceeded = !!lastSuccess;
  const lastAttemptOlderThanSuccess =
    lastAttempt &&
    lastSuccess &&
    parseIsoToMs(lastAttempt.finished_at) !== parseIsoToMs(lastSuccess.finished_at);

  return (
    <section
      aria-label="수집 진단"
      className="mb-3 rounded-2xl border border-amber-200/70 bg-amber-50/40 px-4 py-3 text-xs shadow-sm dark:border-amber-400/30 dark:bg-amber-500/10 sm:px-5 sm:py-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200">
            <span aria-hidden>🔧</span>
            수집 진단
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:bg-amber-400/20 dark:text-amber-200">
              admin
            </span>
          </span>
          <span className="text-[11px] text-amber-700/80 dark:text-amber-200/70">
            자동 수집 일정: 매일 08:30 KST · 23:30 UTC ·{" "}
            <span className="font-mono">30 23 * * *</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshProbe()}
            disabled={envProbeLoading}
            className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-amber-600/90 px-2 text-[11px] font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500/80 dark:hover:bg-amber-500"
          >
            {envProbeLoading ? "점검 중…" : "환경 재점검"}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-white/70 px-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-white dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/30 dark:hover:bg-amber-500/20"
          >
            {collapsed ? "펼치기" : "접기"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3 grid gap-x-6 gap-y-2 md:grid-cols-2">
          {/* 좌측: collection_runs 기반 진단 */}
          <div className="space-y-1.5 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-amber-200/60 dark:bg-slate-900/50 dark:ring-amber-400/20">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              collection_runs (Supabase)
            </p>

            {fetchError && (
              <p className="break-words rounded-md bg-rose-50 px-2 py-1 font-mono text-[11px] text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                Supabase 조회 실패: {fetchError}
              </p>
            )}

            <Row label="마지막 시도">
              {lastAttempt ? (
                <>
                  <span className="font-medium tabular-nums">
                    {formatKstFull(lastAttempt.finished_at)} KST
                  </span>
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    ({formatRelativeKstAgo(lastAttempt.finished_at)})
                  </span>
                  <span
                    className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      lastAttempt.ok
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                    }`}
                  >
                    {lastAttempt.ok ? "성공" : "실패"}
                  </span>
                  <span
                    className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      lastSource.tone === "manual"
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                        : lastSource.tone === "auto"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300"
                    }`}
                  >
                    {lastSource.label}
                  </span>
                </>
              ) : fetchError ? (
                <span className="text-slate-500 dark:text-slate-400">
                  조회 실패로 알 수 없음
                </span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">이력 없음</span>
              )}
            </Row>

            <Row label="마지막 성공">
              {lastSuccess ? (
                <>
                  <span className="font-medium tabular-nums">
                    {formatKstFull(lastSuccess.finished_at)} KST
                  </span>
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    ({formatRelativeKstAgo(lastSuccess.finished_at)})
                  </span>
                  {lastSuccessStale && (
                    <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-400/20 dark:text-amber-200">
                      08:30 KST 이전
                    </span>
                  )}
                  <span
                    className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      lastSuccessSource.tone === "manual"
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                        : lastSuccessSource.tone === "auto"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300"
                    }`}
                  >
                    {lastSuccessSource.label}
                  </span>
                </>
              ) : (
                <span className="text-rose-700 dark:text-rose-300">
                  성공한 수집 이력이 없습니다
                </span>
              )}
            </Row>

            {lastAttemptOlderThanSuccess && lastAttempt && !lastAttempt.ok && (
              <p className="rounded-md bg-rose-50 px-2 py-1 text-[11px] text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                <strong>주의:</strong> 마지막 시도가 실패했습니다. 화면 데이터는 직전 성공 시각
                기준으로 그대로 유지됩니다.
              </p>
            )}

            {lastAttempt?.errors && lastAttempt.errors.length > 0 && (
              <Row label="오류">
                <span className="break-all font-mono text-[11px] text-rose-700 dark:text-rose-300">
                  {lastAttempt.errors[0]}
                  {lastAttempt.errors.length > 1 &&
                    ` 외 ${lastAttempt.errors.length - 1}건`}
                </span>
              </Row>
            )}

            {lastAttempt?.id && (
              <Row label="run id">
                <span className="break-all font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {lastAttempt.id}
                </span>
              </Row>
            )}

            {!hasEverSucceeded && !fetchError && (
              <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                "지금 수집" 버튼으로 첫 성공 row 를 만들거나, Vercel 대시보드의 Cron 설정을
                확인해 주세요.
              </p>
            )}
          </div>

          {/* 우측: 환경 / 엔드포인트 진단 */}
          <div className="space-y-1.5 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-amber-200/60 dark:bg-slate-900/50 dark:ring-amber-400/20">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              환경 점검 (/api/collect-now GET)
            </p>

            {envProbeError && !envProbe && (
              <p className="break-words rounded-md bg-rose-50 px-2 py-1 font-mono text-[11px] text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                점검 실패: {envProbeError}
              </p>
            )}

            {envProbe && (
              <>
                <Row label="ready">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      envProbe.ready
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                    }`}
                  >
                    {envProbe.ready ? "준비됨" : "준비 안됨"}
                  </span>
                </Row>

                {envProbe.missingEnv.length > 0 && (
                  <Row label="누락 env">
                    <span className="break-all font-mono text-[11px] text-rose-700 dark:text-rose-300">
                      {envProbe.missingEnv.join(", ")}
                    </span>
                  </Row>
                )}

                <Row label="DB 접근">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      envProbe.collectionRunsAccessible
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                    }`}
                  >
                    collection_runs{" "}
                    {envProbe.collectionRunsAccessible ? "OK" : "FAIL"}
                  </span>
                  {envProbe.collectionRunsError && (
                    <span className="ml-2 break-all font-mono text-[11px] text-rose-700 dark:text-rose-300">
                      {envProbe.collectionRunsError}
                    </span>
                  )}
                </Row>

                <Row label="실행 상태">
                  <span className="text-slate-600 dark:text-slate-300">
                    isRunning: {envProbe.isRunning ? "예" : "아니오"}
                    {envProbe.cooldownRemainingMs > 0 && (
                      <span className="ml-2">
                        cool-down{" "}
                        {Math.ceil(envProbe.cooldownRemainingMs / 1000)}s 남음
                      </span>
                    )}
                  </span>
                </Row>
              </>
            )}

            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Vercel cron 동작 확인은 Vercel 대시보드 &gt; Settings &gt; Cron Jobs &gt;{" "}
              <span className="font-mono">/api/cron/collect-g2b</span> 의 최근 실행 로그에서
              확인할 수 있습니다.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
