import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const BASE_URL = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
export const G2B_AWARD_SOURCE_URL = "https://www.data.go.kr/data/15129397/openapi.do";

export type CompetitiveAwardCompany =
  | "이노그리드"
  | "에이블클라우드"
  | "오케스트로"
  | "오케스트로클라우드";

export const COMPETITIVE_AWARD_COMPANIES = [
  { competitor: "이노그리드" as const, bizno: "2208736743" },
  { competitor: "에이블클라우드" as const, bizno: "8868602158" },
  { competitor: "오케스트로" as const, bizno: "6748801017" },
  { competitor: "오케스트로클라우드" as const, bizno: "6318603620" },
] as const;

const AWARD_KINDS = [
  { category: "용역", endpoint: "getScsbidListSttusServcPPSSrch" },
  { category: "물품", endpoint: "getScsbidListSttusThngPPSSrch" },
  { category: "공사", endpoint: "getScsbidListSttusCnstwkPPSSrch" },
  { category: "외자", endpoint: "getScsbidListSttusFrgcptPPSSrch" },
] as const;

export type CompetitiveAwardRow = {
  external_key: string;
  competitor: CompetitiveAwardCompany;
  winner_name: string;
  winner_business_no: string;
  award_date: string | null;
  opening_at: string | null;
  bid_no: string;
  bid_ord: string | null;
  project: string;
  customer: string | null;
  amount: string | null;
  rate: number | null;
  category: string;
  source_label: string;
  source_url: string;
  source_type: "g2b_award";
  evidence: string;
  raw_data: Record<string, unknown>;
  updated_at: string;
};

type MonthWindow = { start: string; end: string; label: string };
type RawItem = Record<string, unknown>;

type FetchTask = {
  company: (typeof COMPETITIVE_AWARD_COMPANIES)[number];
  kind: (typeof AWARD_KINDS)[number];
  window: MonthWindow;
};

type FetchTaskResult = {
  rows: CompetitiveAwardRow[];
  fetched: number;
  requests: number;
  mismatches: number;
  errors: string[];
};

export type CompetitiveAwardCollectResult = {
  ok: boolean;
  startDate: string;
  endDate: string;
  requestCount: number;
  fetchedCount: number;
  verifiedCount: number;
  dedupedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedMismatchCount: number;
  retriedTaskCount: number;
  failedTaskCount: number;
  companyCounts: Record<CompetitiveAwardCompany, number>;
  errors: string[];
  rows: CompetitiveAwardRow[];
};

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function toFiniteNumber(value: unknown): number | null {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toBigintText(value: unknown): string | null {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  if (/^-?\d+$/.test(cleaned)) return cleaned;
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(Math.round(n)) : null;
}

function normalizeDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function normalizeTimestamp(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (!m) return null;
  const hh = m[4] ?? "00";
  const mm = m[5] ?? "00";
  const ss = m[6] ?? "00";
  return `${m[1]}-${m[2]}-${m[3]}T${hh}:${mm}:${ss}+09:00`;
}

function parseYmd(value: string): { y: number; m: number; d: number } {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`날짜 형식 오류: ${value}`);
  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, month - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== d) {
    throw new Error(`유효하지 않은 날짜: ${value}`);
  }
  return { y, m: month, d };
}

function formatDateUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function ymdhm(value: string, endOfDay: boolean): string {
  const { y, m, d } = parseYmd(value);
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}${endOfDay ? "2359" : "0000"}`;
}

export function buildMonthlyAwardWindows(startDate: string, endDate: string): MonthWindow[] {
  const startParts = parseYmd(startDate);
  const endParts = parseYmd(endDate);
  const start = new Date(Date.UTC(startParts.y, startParts.m - 1, startParts.d));
  const end = new Date(Date.UTC(endParts.y, endParts.m - 1, endParts.d));
  if (start.getTime() > end.getTime()) throw new Error("startDate가 endDate보다 늦습니다.");

  const windows: MonthWindow[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor.getTime() <= end.getTime()) {
    const monthStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const actualStart = monthStart.getTime() < start.getTime() ? start : monthStart;
    const actualEnd = monthEnd.getTime() > end.getTime() ? end : monthEnd;
    const startYmd = formatDateUtc(actualStart);
    const endYmd = formatDateUtc(actualEnd);
    windows.push({
      start: ymdhm(startYmd, false),
      end: ymdhm(endYmd, true),
      label: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return windows;
}

function responseItems(parsed: unknown): { totalCount: number; items: RawItem[] } {
  if (!parsed || typeof parsed !== "object") return { totalCount: 0, items: [] };
  const root = parsed as Record<string, unknown>;
  const response = (root.response && typeof root.response === "object" ? root.response : root) as Record<string, unknown>;
  const body = response.body && typeof response.body === "object" ? response.body as Record<string, unknown> : {};
  const totalCount = Number(body.totalCount ?? 0);
  const rawItems = body.items;
  let items: RawItem[] = [];
  if (Array.isArray(rawItems)) {
    items = rawItems.filter((x): x is RawItem => !!x && typeof x === "object");
  } else if (rawItems && typeof rawItems === "object") {
    const item = (rawItems as Record<string, unknown>).item;
    if (Array.isArray(item)) items = item.filter((x): x is RawItem => !!x && typeof x === "object");
    else if (item && typeof item === "object") items = [item as RawItem];
  }
  return { totalCount: Number.isFinite(totalCount) ? totalCount : 0, items };
}

function normalizeAward(task: FetchTask, item: RawItem): CompetitiveAwardRow | null {
  const winnerBizno = digits(item.bidwinnrBizno);
  if (!winnerBizno || winnerBizno !== task.company.bizno) return null;

  const bidNo = text(item.bidNtceNo);
  const project = text(item.bidNtceNm);
  const winnerName = text(item.bidwinnrNm);
  if (!bidNo || !project || !winnerName) return null;

  const bidOrd = text(item.bidNtceOrd) || null;
  const awardDate = normalizeDate(item.fnlSucsfDate) ?? normalizeDate(item.rlOpengDt);
  const openingAt = normalizeTimestamp(item.rlOpengDt);
  const amount = toBigintText(item.sucsfbidAmt);
  const rate = toFiniteNumber(item.sucsfbidRate);
  const customer = text(item.dminsttNm) || null;
  const now = new Date().toISOString();

  return {
    external_key: `${bidNo}:${bidOrd ?? "000"}:${winnerBizno}`,
    competitor: task.company.competitor,
    winner_name: winnerName,
    winner_business_no: winnerBizno,
    award_date: awardDate,
    opening_at: openingAt,
    bid_no: bidNo,
    bid_ord: bidOrd,
    project,
    customer,
    amount,
    rate,
    category: task.kind.category,
    source_label: "조달청 나라장터 낙찰정보서비스",
    source_url: G2B_AWARD_SOURCE_URL,
    source_type: "g2b_award",
    evidence: `나라장터 최종낙찰업체 ${winnerName} · 사업자번호 ${winnerBizno}`,
    raw_data: { ...item, __queryMonth: task.window.label, __category: task.kind.category },
    updated_at: now,
  };
}

async function fetchTask(task: FetchTask, serviceKey: string): Promise<FetchTaskResult> {
  const pageSize = 999;
  const makeUrl = (pageNo: number) => buildG2bUrl(BASE_URL, task.kind.endpoint, {
    serviceKey,
    pageNo,
    numOfRows: pageSize,
    type: "json",
    inqryDiv: 2,
    inqryBgnDt: task.window.start,
    inqryEndDt: task.window.end,
    bizno: task.company.bizno,
  });

  const first = await fetchG2bApi(makeUrl(1), {
    timeoutMs: 12_000,
    retries: 2,
    label: `competitive-award-${task.company.competitor}-${task.kind.category}-${task.window.label}`,
  });
  if (!first.ok) {
    return {
      rows: [], fetched: 0, requests: first.debug.attempts, mismatches: 0,
      errors: [`${task.company.competitor}/${task.kind.category}/${task.window.label}: ${first.error}`],
    };
  }

  const firstParsed = responseItems(first.data);
  const rawItems = [...firstParsed.items];
  let requests = 1;
  const pages = Math.max(1, Math.ceil(firstParsed.totalCount / pageSize));

  for (let pageNo = 2; pageNo <= pages; pageNo++) {
    const next = await fetchG2bApi(makeUrl(pageNo), {
      timeoutMs: 12_000,
      retries: 2,
      label: `competitive-award-${task.company.competitor}-${task.kind.category}-${task.window.label}-p${pageNo}`,
    });
    requests += 1;
    if (!next.ok) {
      return {
        rows: [], fetched: rawItems.length, requests, mismatches: 0,
        errors: [`${task.company.competitor}/${task.kind.category}/${task.window.label}/p${pageNo}: ${next.error}`],
      };
    }
    rawItems.push(...responseItems(next.data).items);
  }

  const rows: CompetitiveAwardRow[] = [];
  let mismatches = 0;
  for (const item of rawItems) {
    const row = normalizeAward(task, item);
    if (row) rows.push(row);
    else mismatches += 1;
  }
  return { rows, fetched: rawItems.length, requests, mismatches, errors: [] };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const out = new Array<R>(items.length);
  let index = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) break;
      out[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function existingKeys(keys: string[]): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  if (!supabase || keys.length === 0) return new Set();
  const found = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    const { data, error } = await supabase.from("competitive_awards").select("external_key").in("external_key", chunk);
    if (error) throw new Error(`기존 낙찰키 조회 실패: ${error.message}`);
    for (const row of data ?? []) {
      const key = (row as { external_key?: string }).external_key;
      if (key) found.add(key);
    }
  }
  return found;
}

async function persistRows(rows: CompetitiveAwardRow[]): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin client unavailable");
  const existing = await existingKeys(rows.map((row) => row.external_key));
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase.from("competitive_awards").upsert(chunk as never, { onConflict: "external_key" });
    if (error) throw new Error(`낙찰 데이터 upsert 실패: ${error.message}`);
    for (const row of chunk) {
      if (existing.has(row.external_key)) updated += 1;
      else inserted += 1;
    }
  }
  return { inserted, updated };
}

function blankCompanyCounts(): Record<CompetitiveAwardCompany, number> {
  return {
    이노그리드: 0,
    에이블클라우드: 0,
    오케스트로: 0,
    오케스트로클라우드: 0,
  };
}

export async function collectCompetitiveAwards(options: {
  startDate: string;
  endDate: string;
  persist?: boolean;
  concurrency?: number;
}): Promise<CompetitiveAwardCollectResult> {
  const serviceKey = process.env.G2B_SERVICE_KEY?.trim();
  if (!serviceKey) throw new Error("G2B_SERVICE_KEY 환경변수가 없습니다.");

  const windows = buildMonthlyAwardWindows(options.startDate, options.endDate);
  const tasks: FetchTask[] = [];
  for (const company of COMPETITIVE_AWARD_COMPANIES) {
    for (const kind of AWARD_KINDS) {
      for (const window of windows) tasks.push({ company, kind, window });
    }
  }

  type TaskRun = { task: FetchTask; result: FetchTaskResult };
  const concurrency = options.concurrency ?? 6;
  let runs = await mapWithConcurrency(tasks, concurrency, async (task): Promise<TaskRun> => ({
    task,
    result: await fetchTask(task, serviceKey),
  }));

  let requestCount = runs.reduce((sum, run) => sum + run.result.requests, 0);
  const failedIndexes = runs.flatMap((run, index) => run.result.errors.length ? [index] : []);
  const retriedTaskCount = failedIndexes.length;

  if (failedIndexes.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    const retryRuns = await mapWithConcurrency(
      failedIndexes.map((index) => runs[index].task),
      Math.min(3, concurrency),
      async (task): Promise<TaskRun> => ({ task, result: await fetchTask(task, serviceKey) }),
    );
    requestCount += retryRuns.reduce((sum, run) => sum + run.result.requests, 0);
    runs = runs.map((run, index) => {
      const retryIndex = failedIndexes.indexOf(index);
      return retryIndex >= 0 ? retryRuns[retryIndex] : run;
    });
  }

  const errors = runs.flatMap((run) => run.result.errors);
  const failedTaskCount = runs.filter((run) => run.result.errors.length > 0).length;
  const fetchedCount = runs.reduce((sum, run) => sum + run.result.fetched, 0);
  const skippedMismatchCount = runs.reduce((sum, run) => sum + run.result.mismatches, 0);
  const verifiedRows = runs.flatMap((run) => run.result.rows);

  const dedupedMap = new Map<string, CompetitiveAwardRow>();
  for (const row of verifiedRows) dedupedMap.set(row.external_key, row);
  const rows = Array.from(dedupedMap.values()).sort((a, b) => {
    const dateCmp = String(b.award_date ?? "").localeCompare(String(a.award_date ?? ""));
    return dateCmp || b.bid_no.localeCompare(a.bid_no);
  });

  let insertedCount = 0;
  let updatedCount = 0;
  if ((options.persist ?? true) && rows.length > 0) {
    const persisted = await persistRows(rows);
    insertedCount = persisted.inserted;
    updatedCount = persisted.updated;
  }

  const companyCounts = blankCompanyCounts();
  for (const row of rows) companyCounts[row.competitor] += 1;

  return {
    ok: errors.length === 0,
    startDate: options.startDate,
    endDate: options.endDate,
    requestCount,
    fetchedCount,
    verifiedCount: verifiedRows.length,
    dedupedCount: rows.length,
    insertedCount,
    updatedCount,
    skippedMismatchCount,
    retriedTaskCount,
    failedTaskCount,
    companyCounts,
    errors,
    rows,
  };
}

export function kstTodayYmd(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function addDaysYmd(ymd: string, delta: number): string {
  const { y, m, d } = parseYmd(ymd);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return formatDateUtc(date);
}
