import type { CollectionRunRow } from "@/lib/supabase";
import { isIsoStaleSinceMorningCutoff } from "@/lib/freshness";

type Props = {
  run: CollectionRunRow | null;
  /** Supabase 조회 자체가 실패한 경우만 채운다. (이력 없음과 구분) */
  error: string | null;
  /** 첫 마운트 시 fetchLastCollectionRun 을 기다리는 동안 true. */
  isLoading: boolean;
  /**
   * 마지막 "성공" 수집 row. lastRun.ok=true 면 동일하지만, 마지막 시도가 실패면
   * 이 값은 더 과거의 성공 row 를 가리킨다. stale 판정은 이 값 기준.
   *  - undefined / null 이면 lastRun.ok=true 인 경우 lastRun 으로 폴백.
   */
  lastSuccess?: CollectionRunRow | null;
  /** 카드 제목. 기본 "최근 수집". */
  title?: string;
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
  // ex) "06-05 12:32"
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

/** mode 또는 source 에서 자동/수동을 판별. */
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
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {title}
          </span>
          <span className="hidden text-[11px] font-normal text-slate-400 dark:text-slate-500 sm:inline">
            (업데이트 주기 매일 08:30)
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

  // "업데이트 필요" 판정 — 마지막 성공 수집이 직전 08:30 KST 이전이면 stale.
  // lastSuccess prop 이 있으면 그것 기준, 없으면 run 자체가 ok=true 일 때만 신선도 평가.
  const successRunForStale = lastSuccess ?? (run.ok ? run : null);
  const isStale = isIsoStaleSinceMorningCutoff(
    successRunForStale?.finished_at ?? null,
  );
  // lastSuccess 가 명시적으로 null 인 경우 = 성공 이력이 한 번도 없음 → 항상 stale.
  const noSuccessEver = lastSuccess === null && !run.ok;

  // warnings 첫 줄 컨텍스트("slot=... · ..." 또는 "mode=manual · ...") 는 우측 메타에 따로 그리므로
  // 메시지 카운트에서 제외.
  const isContextLine = (msg: string) =>
    /^slot=(daily|morning|afternoon|noon)\s*·/.test(msg) || /^mode=(auto|manual)\s*·/.test(msg);
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

  // saved_count 가 있으면 신규/업데이트 분해 표시 (둘 다 있을 때만; 마이그 전 환경 보호).
  const showInsertedUpdated =
    run.inserted_count != null || run.updated_count != null;

  return (
    <Shell title={title}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 leading-tight">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
          <span aria-hidden className="text-blue-500 dark:text-blue-400">●</span>
          {title}
          <span className="ml-1 hidden text-[11px] font-normal text-slate-400 dark:text-slate-500 sm:inline">
            (업데이트 주기 매일 08:30)
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
                ? "성공한 수집 이력이 없습니다. 우측 '지금 수집' 버튼을 눌러 직접 수집해 보세요."
                : "마지막 성공 수집이 오늘 08:30 KST 이전입니다. 자동 수집이 동작하지 않았을 수 있어요."
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
            title={[...errors, ...filteredWarnings, ...(run.message ? [run.message] : [])].join(
              "\n",
            )}
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

      {/* 실패 사유는 카드 하단에 좀 더 눈에 띄게 별도 라인으로 표시. */}
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
