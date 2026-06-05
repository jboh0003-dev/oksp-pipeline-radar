import type { CollectionRunRow } from "@/lib/supabase";

type Props = {
  run: CollectionRunRow | null;
  /** Supabase 조회 자체가 실패한 경우만 채운다. (이력 없음과 구분) */
  error: string | null;
  /** 첫 마운트 시 fetchLastCollectionRun 을 기다리는 동안 true. */
  isLoading: boolean;
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
  if (source.endsWith(":morning")) return "morning";
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

const CARD_TITLE = "최근 자동수집";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label={CARD_TITLE}
      className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:backdrop-blur-sm sm:px-5 sm:py-3.5 sm:text-[13px]"
    >
      {children}
    </section>
  );
}

export default function LastCollectionRunCard({ run, error, isLoading }: Props) {
  if (isLoading) {
    return (
      <Shell>
        <span className="text-slate-500 dark:text-slate-400">{CARD_TITLE} 불러오는 중…</span>
      </Shell>
    );
  }

  if (!run) {
    return (
      <Shell>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {CARD_TITLE}
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

  // warnings 첫 줄 컨텍스트("slot=... · ...") 는 우측 메타에 따로 그리므로 메시지 카운트에서 제외.
  const isContextLine = (msg: string) => /^slot=(morning|noon)\s*·/.test(msg);
  const filteredWarnings = warnings.filter((m) => !isContextLine(m));
  const noticeCount = errors.length + filteredWarnings.length + (hasMessage ? 1 : 0);

  const slotLabel = extractSlotLabel(run.source);
  const pageRange = formatPageRange(run.page_start, run.page_end);
  const targetLabel = run.target_count != null ? `target ${run.target_count}` : null;
  const meta = [slotLabel, pageRange, targetLabel].filter((v): v is string => Boolean(v));

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

  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 leading-tight">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
          <span aria-hidden className="text-blue-500 dark:text-blue-400">●</span>
          {CARD_TITLE}
        </span>
        {statusBadge}
        <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
          {formatKstShort(run.finished_at)} <span className="opacity-60">KST</span>
        </span>

        <span aria-hidden className="hidden h-3.5 w-px bg-slate-200 dark:bg-white/10 sm:inline-block" />

        <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
          저장
          <span className="ml-1 font-semibold tabular-nums text-blue-600 dark:text-blue-300">
            {formatNumber(run.saved_count)}
          </span>
        </span>
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
    </Shell>
  );
}
