import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { kstTodayYmd } from "@/lib/g2b/competitiveAwards";

const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const SOURCE_URL = "https://www.data.go.kr/data/15129397/openapi.do";
// One-off historical extraction uses small per-vendor batches, never daily polling.
// Product keywords identify the virtualization manufacturer even when an SI wins.
export const VIRTUALIZATION_BID_KEYWORD_GROUPS = {
  core: ["가상화", "HCI", "에이블스택", "클라우드잇", "Openstackit", "VMware"],
  nutanix: ["Nutanix", "뉴타닉스", "AHV"],
  vmware: ["vSphere", "ESXi", "vSAN", "VMware"],
  redhat: ["OpenShift Virtualization", "Red Hat Virtualization", "오픈시프트 가상화"],
  proxmox: ["Proxmox", "프록스목스"],
} as const;
export type VendorKeywordGroup = keyof typeof VIRTUALIZATION_BID_KEYWORD_GROUPS;
const KINDS = [
  { category: "물품", operation: "getScsbidListSttusThngPPSSrch" },
  { category: "용역", operation: "getScsbidListSttusServcPPSSrch" },
] as const;
type Raw = Record<string, unknown>;
type Classification = "server_virtualization" | "hci" | "vdi" | "virtualization_other" | "review";
export type VirtualizationBidCandidate = {
  external_key: string; bid_no: string; bid_ord: string | null; award_date: string | null;
  winner_name: string; winner_business_no: string; project: string; customer: string;
  amount: string | null; rate: number | null; category: string;
  classification: Classification; product_brand: string | null; matched_keywords: string[];
  source_type: "g2b_award"; source_url: string; raw_data: Raw; updated_at: string;
};
const str = (v: unknown) => String(v ?? "").trim();
const digits = (v: unknown) => str(v).replace(/\D/g, "");
function ymd(v: unknown): string | null {
  const raw = str(v).replace(/[^0-9]/g, "");
  if (raw.length < 8) return null;
  const value = raw.slice(0, 8);
  const y = +value.slice(0, 4), m = +value.slice(4, 6), d = +value.slice(6, 8);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
function items(parsed: unknown): { total: number; rows: Raw[] } {
  const root = parsed && typeof parsed === "object" ? parsed as Raw : {};
  const response = root.response && typeof root.response === "object" ? root.response as Raw : root;
  const body = response.body && typeof response.body === "object" ? response.body as Raw : {};
  const raw = body.items && typeof body.items === "object" && !Array.isArray(body.items)
    ? (body.items as Raw).item : body.items;
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  return { total: Number(body.totalCount ?? 0) || 0, rows: rows.filter((r): r is Raw => !!r && typeof r === "object") };
}
function productBrand(title: string): string | null {
  if (/에이블스택|ablestack|abelstack/i.test(title)) return "에이블클라우드";
  if (/클라우드잇|cloudit|openstackit|오픈스택잇/i.test(title)) return "이노그리드";
  if (/contrabass|콘트라베이스|viola|비올라/i.test(title)) return "오케스트로";
  if (/dstation|디스테이션/i.test(title)) return "틸론";
  if (/vmware|vsphere|vcenter|esxi/i.test(title)) return "VMware";
  if (/nutanix|뉴타닉스|\bAHV\b|\bNCI\b/i.test(title)) return "Nutanix";
  if (/red\s*hat.{0,16}virtualization|openshift.{0,16}virtualization|레드햇.{0,12}가상화/i.test(title)) return "Red Hat";
  if (/proxmox|프록스목스/i.test(title)) return "Proxmox";
  return null;
}
function classify(title: string): Classification {
  // Title-only search is broad: do not count unrelated virtualization terms.
  if (/(가상\s*화폐|암호화폐|블록체인|가상화\s*스위치|백본\s*가상화|네트워크\s*가상화|가상화.{0,8}물리모델|물리모델.{0,8}가상화|가상화.{0,10}수치해석)/i.test(title)) {
    return "review";
  }
  if (/(가상화.{0,10}데스크톱|데스크톱.{0,10}가상화|가상\s*데스크톱|\bvdi\b|dstation|디스테이션|\bdaas\b|원격근무.{0,10}가상화|원격접속.{0,12}가상화|모바일.{0,8}가상화|가상화.{0,10}스마트오피스)/i.test(title)) {
    return "vdi";
  }
  if (/(\bhci\b|하이퍼.?컨버|hyper.?converg|에이블스택|ablestack)/i.test(title)) return "hci";
  if (/(서버.{0,10}가상화|가상화.{0,10}서버|통합가상화|가상화\s*시스템|가상화소프트웨어|가상화\s*솔루션|가상화\s*인프라|가상화\s*sw|하이퍼바이저|hypervisor|vsphere|vmware|openstackit|오픈스택잇|클라우드잇|cloudit|nutanix|뉴타닉스|\bAHV\b|\bNCI\b|proxmox|프록스목스|openshift.{0,16}virtualization|red\s*hat.{0,16}virtualization)/i.test(title)) {
    return "server_virtualization";
  }
  if (/가상화|virtuali[sz]/i.test(title)) return "virtualization_other";
  return "review";
}
function normalize(input: Raw, keyword: string, category: string): VirtualizationBidCandidate | null {
  const bidNo = str(input.bidNtceNo), winnerNo = digits(input.bidwinnrBizno);
  const project = str(input.bidNtceNm), winnerName = str(input.bidwinnrNm);
  const customer = str(input.dminsttNm);
  if (!bidNo || !winnerNo || !project || !winnerName || !customer || customer === "각 수요기관") return null;
  if (!project.toLowerCase().includes(keyword.toLowerCase())) return null;
  if (/(제\s*3자\s*단가|3자단가|상용SW\s*제3자단가|디지털서비스[,\s_]+\w*등록)/i.test(project) && customer === "각 수요기관") return null;
  const bidOrd = str(input.bidNtceOrd) || null;
  const rawAmount = str(input.sucsfbidAmt).replace(/,/g, "");
  const amount = /^-?\d+$/.test(rawAmount) ? rawAmount : null;
  const rawRate = Number(str(input.sucsfbidRate));
  const rate = str(input.sucsfbidRate) && Number.isFinite(rawRate) ? rawRate : null;
  return {
    external_key: `${bidNo}:${bidOrd ?? "000"}:${winnerNo}`,
    bid_no: bidNo, bid_ord: bidOrd,
    award_date: ymd(input.fnlSucsfDate) ?? ymd(input.rlOpengDt),
    winner_name: winnerName, winner_business_no: winnerNo,
    project, customer, amount, rate, category,
    classification: classify(project), product_brand: productBrand(project),
    matched_keywords: [keyword], source_type: "g2b_award", source_url: SOURCE_URL,
    raw_data: { ...input, __queryKeyword: keyword, __category: category },
    updated_at: new Date().toISOString(),
  };
}
type Task = { keyword: string; category: string; operation: string };
type TaskResult = { rows: VirtualizationBidCandidate[]; fetched: number; requestCount: number; excluded: number; error?: string };
async function fetchTask(task: Task, start: string, end: string, key: string): Promise<TaskResult> {
  const pageSize = 500, maxPages = 20;
  const collected: VirtualizationBidCandidate[] = [];
  let fetched = 0, requestCount = 0, excluded = 0;
  for (let page = 1; page <= maxPages; page++) {
    const url = buildG2bUrl(BASE, task.operation, {
      serviceKey: key, pageNo: page, numOfRows: pageSize, type: "json",
      inqryDiv: 2, inqryBgnDt: start, inqryEndDt: end, bidNtceNm: task.keyword,
    });
    const result = await fetchG2bApi(url, {
      timeoutMs: 20000, retries: 2, label: `virtualization-candidate-${task.category}-${task.keyword}-${page}`,
    });
    requestCount += result.debug.attempts;
    if (!result.ok) return { rows: [], fetched, requestCount, excluded, error: `${task.category}/${task.keyword}/p${page}: ${result.error}` };
    const parsed = items(result.data);
    fetched += parsed.rows.length;
    for (const row of parsed.rows) {
      const candidate = normalize(row, task.keyword, task.category);
      // inqryDiv=2 searches by OPENING DATE, not award date (G2B spec).
      // The award may be finalized weeks later, in a different month.
      // Keep such awards, grouped by final award_date, across the 2024-26 period.
      if (candidate?.award_date && candidate.award_date >= "2024-01-01" &&
          candidate.award_date <= ["2026-10-30", kstTodayYmd()].sort()[0]) {
        collected.push(candidate);
      } else excluded++;
    }
    if (page * pageSize >= parsed.total || parsed.rows.length === 0) break;
    if (page === maxPages) return {rows: [], fetched, requestCount, excluded, error: `${task.category}/${task.keyword}: pagination safety cap exceeded`};
  }
  return {rows:collected,fetched,requestCount,excluded};
}
export async function collectVirtualizationAwardCandidatesMonth(year: number, month: number, persist: boolean, group: VendorKeywordGroup = "core") {
  if (![2024, 2025, 2026].includes(year) || !Number.isInteger(month) || month < 1 || month > 12 || (year===2026 && month>10))
    throw new Error("2024~2026년 10월 범위의 월이 필요합니다.");
  const key = process.env.G2B_SERVICE_KEY?.trim();
  if (!key) throw new Error("G2B_SERVICE_KEY missing");
  const mm = String(month).padStart(2, "0");
  const first = `${year}-${mm}-01`, lastDay = new Date(Date.UTC(year,month,0)).getUTCDate();
  const last = [`${year}-${mm}-${String(lastDay).padStart(2,"0")}`,kstTodayYmd()].sort()[0];
  if (first > last) throw new Error("Future range");
  const start = first.replaceAll("-", "") + "0000", end = last.replaceAll("-", "") + "2359";
  if (!(group in VIRTUALIZATION_BID_KEYWORD_GROUPS)) throw new Error("Unsupported vendor keyword group");
  const keywords:readonly string[] = VIRTUALIZATION_BID_KEYWORD_GROUPS[group];
  const tasks: Task[] = keywords.flatMap(keyword =>
    KINDS.map(kind => ({ keyword, category: kind.category, operation: kind.operation })));
  // Public-data API occasionally times out when several requests overlap.
  // Use bounded concurrency and retry only failed keyword/category tasks.
  let cursor = 0;
  const results = new Array<TaskResult>(tasks.length);
  await Promise.all(Array.from({length: 3}, async () => {
    while (cursor < tasks.length) {
      const idx = cursor++;
      results[idx] = await fetchTask(tasks[idx], start, end, key);
    }
  }));
  const failedIndexes = results.flatMap((result, i) => result.error ? [i] : []);
  if (failedIndexes.length) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    let next = 0;
    await Promise.all(Array.from({length:2}, async () => {
      while (next < failedIndexes.length) {
        const idx = failedIndexes[next++];
        results[idx] = await fetchTask(tasks[idx], start, end, key);
      }
    }));
  }
  const errors = results.flatMap(x => x.error ? [x.error] : []);
  const deduped = new Map<string, VirtualizationBidCandidate>();
  for (const batch of results) for (const row of batch.rows) {
    const previous = deduped.get(row.external_key);
    if (!previous) deduped.set(row.external_key,row);
    else {
      previous.matched_keywords = [...new Set([...previous.matched_keywords,...row.matched_keywords])].sort();
      if (!previous.product_brand && row.product_brand) previous.product_brand = row.product_brand;
    }
  }
  const rows = [...deduped.values()];
  let inserted = 0, updated = 0;
  if (persist && errors.length === 0 && rows.length) {
    const db = getSupabaseAdmin();
    if (!db) throw new Error("Supabase admin unavailable");
    for (let i=0;i<rows.length;i+=100) {
      const chunk = rows.slice(i,i+100);
      const existing = await db.from("virtualization_award_candidates")
        .select("external_key,matched_keywords").in("external_key",chunk.map(row=>row.external_key));
      if (existing.error) throw new Error(existing.error.message);
      const prior = new Map((existing.data??[]).map((r: {external_key:string;matched_keywords:string[]})=>[r.external_key,r.matched_keywords]));
      for(const row of chunk) {
        const old = prior.get(row.external_key);
        if(old) {
          updated++;row.matched_keywords=[...new Set([...old,...row.matched_keywords])].sort();
        } else inserted++;
      }
      const write = await db.from("virtualization_award_candidates").upsert(chunk as never,{onConflict:"external_key"});
      if(write.error) throw new Error(write.error.message);
    }
  }
  return {
    ok: errors.length === 0,year,month,persist,group,
    requestCount: results.reduce((n,x)=>n+x.requestCount,0),
    fetchedCount: results.reduce((n,x)=>n+x.fetched,0),
    excludedCount: results.reduce((n,x)=>n+x.excluded,0),
    matchedCount: rows.length, insertedCount: inserted, updatedCount: updated,
    withNamedBrand: rows.filter(x=>x.product_brand).length, errors,
    samples: persist ? [] : rows.slice(0,6).map(x=>({
      date:x.award_date,project:x.project,winner:x.winner_name,brand:x.product_brand,classification:x.classification,
    })),
  };
}
