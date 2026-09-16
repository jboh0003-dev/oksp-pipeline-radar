import type { CollectionRunRow } from "@/lib/supabase";

type Props = {
  run: CollectionRunRow | null;
  error: string | null;
  isLoading: boolean;
  lastSuccess?: CollectionRunRow | null;
  title?: string;
  showManualCollectHint?: boolean;
};

const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

function formatKstShort(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return KST_FORMATTER.format(date).replace(/\. /g, "-").replace(/\.$/, "");
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("ko-KR");
}

/**
 * 가장 최근 입찰공고 수집 시도를 그대로 보여준다.
 * 최근 시도가 실패했으면 오래된 성공 건을 "정상"으로 위장하지 않고
 * 사용자에게 간단한 상태와 마지막 정상 시각만 알려준다.
 */
export default function LastCollectionRunCard(props: Props) {
  const {
    run,
    lastSuccess,
    title = "최근 수집",
    error,
    isLoading,
    showManualCollectHint,
  } = props;

  void error;
  void showManualCollectHint;

  if (isLoading) return null;

  const latestFailed = Boolean(run && !run.ok);
  const displayRun = run ?? lastSuccess ?? null;
  if (!displayRun) return null;

  const showInsertedUpdated =
    displayRun.inserted_count != null || displayRun.updated_count != null;

  return (
    <section
      aria-label={title}
      className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:px-5 sm:py-3.5 sm:text-[13px]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 leading-tight">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${latestFailed ? "bg-amber-500" : "bg-emerald-500"}`}
          />
          {title}
        </span>

        <span
          className={
            latestFailed
              ? "inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30"
              : "inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30"
          }
        >
          {latestFailed ? "수집 확인 필요" : "정상"}
        </span>

        <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
          {formatKstShort(displayRun.finished_at)} <span className="opacity-60">KST</span>
        </span>

        {latestFailed ? (
          lastSuccess?.finished_at ? (
            <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
              마지막 정상 {formatKstShort(lastSuccess.finished_at)} KST
            </span>
          ) : null
        ) : (
          <>
            <span aria-hidden className="hidden h-3.5 w-px bg-slate-200 dark:bg-white/10 sm:inline-block" />

            {showInsertedUpdated ? (
              <>
                <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                  신규
                  <span className="ml-1 font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">
                    {formatNumber(displayRun.inserted_count)}
                  </span>
                </span>
                <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                  업데이트
                  <span className="ml-1 font-semibold tabular-nums text-blue-600 dark:text-blue-300">
                    {formatNumber(displayRun.updated_count)}
                  </span>
                </span>
              </>
            ) : (
              <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                신규
                <span className="ml-1 font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">
                  {formatNumber(displayRun.saved_count)}
                </span>
              </span>
            )}

            <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
              조회
              <span className="ml-1 font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {formatNumber(displayRun.fetched_count)}
              </span>
            </span>

            <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
              매칭
              <span className="ml-1 font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {formatNumber(displayRun.matched_count)}
              </span>
            </span>
          </>
        )}
      </div>
    </section>
  );
}
