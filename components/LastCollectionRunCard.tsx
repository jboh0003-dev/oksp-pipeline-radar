import type { CollectionRunRow } from "@/lib/supabase";

type Props = {
  run: CollectionRunRow | null;
  /** Supabase 조회 자체가 실패한 경우만 채운다. (이력 없음과 구분) */
  error: string | null;
  /** 첫 마운트 시 fetchLastCollectionRun 을 기다리는 동안 true. */
  isLoading: boolean;
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

function formatKstDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return KST_FORMATTER.format(date).replace(/\. /g, "-").replace(/\.$/, "");
}

function pickItems(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string" && v.trim().length > 0);
}

function summarizeMessages(items: string[], limit = 2): {
  preview: string[];
  remaining: number;
} {
  if (items.length <= limit) {
    return { preview: items, remaining: 0 };
  }
  return { preview: items.slice(0, limit), remaining: items.length - limit };
}

function StatusBadge({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#E5F5EA] px-2.5 py-1 text-xs font-semibold text-[#1A8245]">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#1A8245]" />
        정상
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FFEBEB] px-2.5 py-1 text-xs font-semibold text-[#C92A2A]">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#C92A2A]" />
      실패
    </span>
  );
}

function MetricCell({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  const display = value == null ? "-" : value.toLocaleString("ko-KR");
  return (
    <div className="flex flex-col items-start">
      <span className="text-[11px] font-medium text-[#8B95A1] sm:text-xs">{label}</span>
      <span
        className={`mt-1 text-lg font-bold tracking-tight sm:text-xl ${
          accent ? "text-[#3182F6]" : "text-[#191F28]"
        }`}
      >
        {display}
      </span>
    </div>
  );
}

const CARD_TITLE = "최근 자동수집 실행 결과";
const CARD_HELP_TEXT = "아래 수치는 전체 누적이 아니라 마지막 자동수집 1회 기준입니다.";

/**
 * collection_runs.source 값에서 slot 라벨을 추출한다.
 * 형식: "cron:collect-g2b:morning" / "cron:collect-g2b:noon"
 * 슬롯이 없거나 알 수 없는 형식이면 null 을 반환해 카드에서 슬롯 라인을 숨긴다.
 */
function extractSlotLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  if (source.endsWith(":morning")) return "morning";
  if (source.endsWith(":noon")) return "noon";
  return null;
}

/** 페이지 범위 라벨. 둘 다 없으면 null. */
function formatPageRange(start: number | null, end: number | null): string | null {
  if (start == null && end == null) return null;
  if (start != null && end != null) return `pages ${start}-${end}`;
  if (start != null) return `pages ${start}-`;
  return `pages -${end}`;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label={CARD_TITLE}
      className="mb-4 rounded-2xl border border-[#E5E8EB] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5"
    >
      {children}
    </section>
  );
}

export default function LastCollectionRunCard({ run, error, isLoading }: Props) {
  if (isLoading) {
    return (
      <CardShell>
        <p className="text-xs font-medium text-[#8B95A1] sm:text-sm">{CARD_TITLE}</p>
        <p className="mt-2 text-sm text-[#8B95A1]">불러오는 중...</p>
      </CardShell>
    );
  }

  if (!run) {
    return (
      <CardShell>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-[#8B95A1] sm:text-sm">{CARD_TITLE}</p>
          <span className="rounded-full bg-[#F2F4F6] px-2.5 py-1 text-xs font-semibold text-[#6B7684]">
            이력 없음
          </span>
        </div>
        <p className="mt-2 text-sm text-[#4E5968]">
          아직 자동수집이 실행된 적이 없거나, collection_runs 테이블을 읽지 못했습니다.
        </p>
        {error && (
          <p className="mt-2 break-all rounded-lg bg-[#F9FAFB] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#8B95A1]">
            {error}
          </p>
        )}
      </CardShell>
    );
  }

  const errors = pickItems(run.errors);
  const warnings = pickItems(run.warnings);
  const messageItems = run.message ? [run.message] : [];

  const slotLabel = extractSlotLabel(run.source);
  const pageRange = formatPageRange(run.page_start, run.page_end);
  const targetLabel = run.target_count != null ? `target ${run.target_count}` : null;
  const contextParts = [slotLabel, pageRange, targetLabel].filter(
    (v): v is string => Boolean(v),
  );

  // warnings 첫 줄에 cron route 가 직접 기록한 실행 컨텍스트(`slot=... · pages ... · lookback ...`)를
  // 넣고 있다. 카드 상단에 이미 같은 정보를 보여주므로, 알림 영역에서는 그 라인을 숨겨 중복을 줄인다.
  const isContextLine = (msg: string) => /^slot=(morning|noon)\s*·/.test(msg);
  const filteredWarnings = warnings.filter((m) => !isContextLine(m));

  const allNotices = [...errors, ...filteredWarnings, ...messageItems];
  const noticeKind: "error" | "warning" | "ok" =
    errors.length > 0
      ? "error"
      : filteredWarnings.length > 0 || messageItems.length > 0
        ? "warning"
        : "ok";

  const { preview, remaining } = summarizeMessages(allNotices);

  const noticeStyles = {
    error: "border border-[#FFD6D6] bg-[#FFF0F0] text-[#912018]",
    warning: "border border-[#FFE4B2] bg-[#FFF8E1] text-[#8A4B00]",
    ok: "border border-[#E5E8EB] bg-[#F9FAFB] text-[#4E5968]",
  } as const;

  return (
    <CardShell>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#8B95A1] sm:text-sm">{CARD_TITLE}</p>
          <p className="mt-1 text-sm font-semibold text-[#191F28] sm:text-base">
            {formatKstDateTime(run.finished_at)}
          </p>
          <p className="mt-0.5 text-[11px] text-[#8B95A1]">KST</p>
          {contextParts.length > 0 && (
            <p className="mt-1 text-[11px] text-[#6B7684] sm:text-xs">
              실행 구간: {contextParts.join(" · ")}
            </p>
          )}
        </div>
        <StatusBadge ok={run.ok} />
      </header>

      <p className="mt-3 text-[11px] leading-relaxed text-[#8B95A1] sm:text-xs">
        {CARD_HELP_TEXT}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-[#F9FAFB] px-3 py-3 sm:gap-4 sm:px-4">
        <MetricCell label="신규 저장" value={run.saved_count} accent />
        <MetricCell label="나라장터 조회" value={run.fetched_count} />
        <MetricCell label="제품 매칭" value={run.matched_count} />
      </div>

      {allNotices.length > 0 && (
        <div className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${noticeStyles[noticeKind]}`}>
          <p className="font-semibold">
            {noticeKind === "error"
              ? `오류 ${errors.length}건`
              : noticeKind === "warning"
                ? `안내 ${filteredWarnings.length + messageItems.length}건`
                : "메시지"}
          </p>
          <ul className="mt-1 space-y-1 break-all">
            {preview.map((msg, idx) => (
              <li key={`${idx}-${msg.slice(0, 24)}`}>· {msg}</li>
            ))}
          </ul>
          {remaining > 0 && (
            <p className="mt-1 text-[11px] opacity-70">외 {remaining}건</p>
          )}
        </div>
      )}
    </CardShell>
  );
}
