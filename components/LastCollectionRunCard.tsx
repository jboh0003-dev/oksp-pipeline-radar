import type { CollectionRunRow } from "@/lib/supabase";
import { isIsoStaleSinceMorningCutoff } from "@/lib/freshness";

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
  return KST_FORMATTER.format(date)
    .replace(/\. /g, "-")
    .replace(/\.$/, "")
    .replace(" ", " ");
}

function pickItems(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string" && v.trim().length > 0);
}

function extractSlotLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source.includes(":range:")) return "분산";
  if (source.endsWith(":daily")) return "daily";
  if (source.endsWith(":morning")) return "morning";
  if (source.endsWith(":afternoon")) return "afternoon";
  if (source.endsWith(":noon")) return "noon";
  return null;
}

function formatPageRange(start: number | null, end: number | null): string | null {
  if (start == null && end == null) return null;
  if (start != null && end != null) return `p${start}-${end}`;
  if (start != null) return `p${start}-`;
  return `p-${end}`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("ko-KR");
}

function resolveMode(
  mode: CollectionRunRow["mode"],
  source: string | null | undefined,
): "auto" | "manual" {
  if (mode === "manual") return "manual";
  if (mode === "auto") return "auto";
  if (source && source.startsWith("manual:")) return "manual";
  return "auto";
}

const DEFAULT_CARD_TITLE = "최근 수집";

function Shell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section
      aria-label={title}
      className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:backdrop-blur-sm sm:px-5 sm:py-3.5 sm:text-[13px]"
    >
      {children}
    </section>
  );
}

export default function LastCollectionRunCard({
  run,
  error,
  isLoading,
  lastSuccess,
  title = DEFAULT_CARD_TITLE,
  showManualCollectHint = true,
}: Props) {
  if (isLoading) {
    return (
      <Shell title={title}>
        <span className="text-slate-500 dark:text-slate-400">{title} 불러오는 중…</span>
      </Shell>
    );
  }

  if (!run) {
    return (
      <Shell title={title}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{title}</span>
          <span className="hidden text-[11px] font-normal text-slate-400 dark:text-slate-500 sm:inline">
            (오전 분산 자동수집)
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            이력 없음
          </span>
          {error && (
            <span className="break-all font-mono text-[11px] text-slate-400 dark:text-slate-500">
              {error}
            </span>
          )}
        </div>
      </Shell>
    );
  }

  const errors = pickItems(run.errors);
  const warnings = pickItems(run.warnings);
  const hasMessage = Boolean(run.message);

  const successRunForStale = lastSuccess ?? (run.ok ? run : null);
  const isStale = isIsoStaleSinceMorningCutoff(successRunForStale?.finished_at ?? null);
  const noSuccessEver = lastSuccess === null && !run.ok;

  const isContextLine = (msg: string) =>
    /^slot=(daily|morning|afternoon|noon)\s*·/.test(msg) ||
    /^mode=(auto|manual)\s*·/.test(msg) ||
    /^sharded-range=/.test(msg);
  const filteredWarnings = warnings.filter((m) => !isContextLine(m));
  const noticeCount = errors.length + filteredWarnings.length + (hasMessage ? 1 : 0);

  const mode = resolveMode(run.mode, run.source);
  const slotLabel = extractSlotLabel(run.source);
  const pageRange = formatPageRange(run.page_start, run.page_end);
  const targetLabel = run.target_count != null ? `target ${run.target_count}` : null;
  const meta = [slotLabel, pageRange, targetLabel].filter((v): v is string => Boolean(v));

  const modeBadge =
    mode === "manual" ? (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30">
        수동
      </span>
    ) : (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/30">
        자동
      </span>
    );

  const statusBadge = run.ok ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
      정상
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400" />
      실패
    </span>
  );

  const showInsertedUpdated = run.inserted_count != null || run.updated_count != null;

  return (
    <Shell title={title}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 leading-tight">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
          <span aria-hidden className="text-blue-500 dark:text-blue-400">●</span>
          {title}
          <span className="ml-1 hidden text-[11px] font-normal text-slate-400 dark:text-slate-500 sm:inline">
            (오전 분산 자동수집)
          </span>
        </span>
        {modeBadge}
        {statusBadge}
        <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
          {formatKstShort(run.finished_at)} <span className="opacity-60">KST</span>
        </span>
        {(isStale || noSuccessEver) && (
          <span
            title={
              noSuccessEver
                ? showManualCollectHint
                  ? "성공한 수집 이력이 없습니다. 자동수집 상태를 확인하거나 필요 시 '지금 수집'을 사용하세요."
                  : "성공한 자동 수집 이력이 없습니다. 오전 자동수집 상태를 확인해 주세요."
                : showManualCollectHint
                  ? "오늘 오전 자동수집 시작 이후 성공 이력이 없습니다. 자동수집 상태를 확인해 주세요."
                  : "오늘 오전 자동수집 시작 이후 성공 이력이 없습니다. 잠시 후 새로고침해 주세요."
            }
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30"
          >
            <span aria-hidden>⚠</span>
            업데이트 필요
          </span>
        )}

        <span aria-hidden className="hidden h-3.5 w-px bg-slate-200 dark:bg-white/10 sm:inline-block" />

        {showInsertedUpdated ? (
          <>
            <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
              신규
              <span className="ml-1 font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">
                {formatNumber(run.inserted_count)}
              </span>
            </span>
            <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
              업데이트
              <span className="ml-1 font-semibold tabular-nums text-blue-600 dark:text-blue-300">
                {formatNumber(run.updated_count)}
              </span>
            </span>
          </>
        ) : (
          <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
            저장
            <span className="ml-1 font-semibold tabular-nums text-blue-600 dark:text-blue-300">
              {formatNumber(run.saved_count)}
            </span>
          </span>
        )}
        <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
          조회
          <span className="ml-1 font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {formatNumber(run.fetched_count)}
          </span>
        </span>
        <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
          매칭
          <span className="ml-1 font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {formatNumber(run.matched_count)}
          </span>
        </span>

        {meta.length > 0 && (
          <>
            <span aria-hidden className="hidden h-3.5 w-px bg-slate-200 dark:bg-white/10 sm:inline-block" />
            <span className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
              {meta.join(" · ")}
            </span>
          </>
        )}

        {noticeCount > 0 && (
          <span
            title={[...errors, ...filteredWarnings, ...(run.message ? [run.message] : [])].join("\n")}
            className={`ml-auto inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              errors.length > 0
                ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            }`}
          >
            {errors.length > 0 ? `오류 ${errors.length}` : `안내 ${noticeCount}`}
          </span>
        )}
      </div>

      {!run.ok && errors.length > 0 && (
        <p className="mt-2 break-words text-[11px] leading-5 text-rose-700 dark:text-rose-300">
          <span className="font-semibold">실패 사유:</span>{" "}
          <span className="font-mono">{errors[0]}</span>
          {errors.length > 1 && (
            <span className="ml-1 text-rose-500/80 dark:text-rose-300/70">
              외 {errors.length - 1}건
            </span>
          )}
        </p>
      )}
    </Shell>
  );
}
