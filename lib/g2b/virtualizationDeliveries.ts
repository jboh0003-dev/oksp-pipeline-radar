import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const BASE = "https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService";
const OP = "getDlvrReqDtlInfoList";
// A curated product-name probe is intentionally separate from the broader company-award collector.
export const VIRTUALIZATION_KEYWORDS = [
  "에이블스택", "ABLESTACK", "가상화", "하이퍼바이저", "HCI",
  "VMware", "vSphere", "OpenStack", "오픈스택", "CONTRABASS",
  "VIOLA", "클라우드잇",
] as const;
type RawItem = Record<string, unknown>;
export type DeliveryItem = {
  external_key: string; delivery_request_no: string; delivery_change_order: string | null;
  product_serial: string; receipt_date: string; original_request_date: string | null;
  contract_no: string | null; product_id: string | null; product_name: string;
  product_category: string | null; brand: string | null; supplier_name: string | null;
  supplier_business_no: string | null; customer_name: string | null;
  amount: number | null; quantity: number | null; final_request: boolean;
  classification: "virtualization" | "related" | "review"; matched_keyword: string;
  source_type: "g2b_shopping_delivery"; raw_data: RawItem; updated_at: string;
};
const str = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown): number | null => {
  const valueNumber = Number(str(value).replaceAll(",", ""));
  return str(value) && Number.isFinite(valueNumber) ? valueNumber : null;
};
function dateString(value: unknown): string | null {
  const raw = str(value).replace(/[^0-9]/g, "");
  if (raw.length < 8) return null;
  const date = raw.slice(0, 8);
  const year = +date.slice(0, 4), month = +date.slice(4, 6), day = +date.slice(6, 8);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
    ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : null;
}
function extractItems(input: unknown): { items: RawItem[]; total: number } {
  const root = input && typeof input === "object" ? input as RawItem : {};
  const response = root.response && typeof root.response === "object" ? root.response as RawItem : root;
  const body = response.body && typeof response.body === "object" ? response.body as RawItem : {};
  const container = body.items;
  const nested = container && typeof container === "object" && !Array.isArray(container) ? (container as RawItem).item : container;
  const items = Array.isArray(nested) ? nested : nested && typeof nested === "object" ? [nested] : [];
  return { items: items.filter((v): v is RawItem => v != null && typeof v === "object"), total: num(body.totalCount) ?? 0 };
}
function classifyProduct(productName: string): { brand: string | null; classification: DeliveryItem["classification"] } {
  const product = productName.toLowerCase();
  const brands: Array<[RegExp, string]> = [
    [/에이블스택|ablestack|abelstack/i, "에이블클라우드 / ABLESTACK"],
    [/contrabass|콘트라베이스|콘트라바스/i, "오케스트로 / CONTRABASS"],
    [/viola|비올라/i, "오케스트로 / VIOLA"],
    [/vmware|vsphere|vcenter|esxi|vcloud/i, "VMware"],
    [/openstack|오픈스택/i, "OpenStack"],
    [/클라우드잇|cloudit/i, "이노그리드 / CloudIt"],
  ];
  const brand = brands.find(([pattern]) => pattern.test(product))?.[1] ?? null;
  if (brand || /가상화|하이퍼바이저|hypervisor|hyper-v|\bhci\b|하이퍼컨버지드|하이퍼컨버전스/i.test(product)) {
    return { brand, classification: "virtualization" };
  }
  return { brand: null, classification: "review" };
}
function normalize(item: RawItem, keyword: string): DeliveryItem | null {
  const requestNo = str(item.dlvrReqNo);
  const serial = str(item.prdctSno);
  const receipt = dateString(item.dlvrReqRcptDate);
  const name = str(item.prdctIdntNoNm);
  if (!requestNo || !serial || !receipt || !name) return null;
  // Query APIs can return fuzzy or generic product matches; reject non-matching item names.
  if (!name.toLowerCase().includes(keyword.toLowerCase())) return null;
  const { brand, classification } = classifyProduct(name);
  if (classification !== "virtualization") return null;
  return {
    external_key: `delivery:${requestNo}:${serial}`,
    delivery_request_no: requestNo, delivery_change_order: str(item.dlvrReqChgOrd) || null,
    product_serial: serial, receipt_date: receipt,
    original_request_date: dateString(item.IntlCntrctDlvrReqDate),
    contract_no: str(item.cntrctNo) || null,
    product_id: str(item.prdctIdntNo) || null,
    product_name: name, product_category: str(item.dtilPrdctClsfcNoNm) || null,
    brand, supplier_name: str(item.corpNm) || null,
    supplier_business_no: str(item.cntrctCorpBizno).replace(/\D/g, "") || null,
    customer_name: str(item.dminsttNm) || null,
    amount: num(item.prdctAmt), quantity: num(item.prdctQty),
    final_request: str(item.fnlDlvrReqYn).toUpperCase() === "Y",
    classification, matched_keyword: keyword,
    source_type: "g2b_shopping_delivery", raw_data: item, updated_at: new Date().toISOString(),
  };
}
function compareVersions(a: DeliveryItem, b: DeliveryItem): number {
  const va = Number(a.delivery_change_order ?? 0), vb = Number(b.delivery_change_order ?? 0);
  return va - vb || a.receipt_date.localeCompare(b.receipt_date);
}
export async function collectVirtualizationDeliveryMonth(year: number, month: number, keyword: string, persist = false) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (![2024, 2025, 2026].includes(year) || !Number.isInteger(month) || month < 1 || month > 12)
    throw new Error("조회기간은 2024~2026년 중 한 달이어야 합니다.");
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  if (firstDay > today.slice(0, 7) + "-01") throw new Error("미래 월을 수집할 수 없습니다.");
  if (!VIRTUALIZATION_KEYWORDS.includes(keyword as typeof VIRTUALIZATION_KEYWORDS[number]))
    throw new Error("지원되지 않는 제품 검색어입니다.");
  const key = process.env.G2B_SERVICE_KEY?.trim();
  if (!key) throw new Error("G2B_SERVICE_KEY is missing");
  const start = `${year}${String(month).padStart(2, "0")}01`;
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}${String(month).padStart(2, "0")}${String(end).padStart(2, "0")}`;
  const pageSize = 100;
  const limitPages = 50;
  let fetched = 0, requests = 0, reportedTotal = 0;
  const collected: DeliveryItem[] = [];
  for (let page = 1; page <= limitPages; page++) {
    const url = buildG2bUrl(BASE, OP, {
      serviceKey: key, type: "json", inqryDiv: 1,
      inqryBgnDate: start, inqryEndDate: last, prdctIdntNoNm: keyword,
      pageNo: page, numOfRows: pageSize,
    });
    const result = await fetchG2bApi(url, { timeoutMs: 15000, retries: 2, label: `virtualization-delivery-${year}-${month}-${keyword}-${page}` });
    requests += result.debug.attempts;
    if (!result.ok) throw new Error(`납품요구 API 실패 (${year}-${month}, ${keyword}, p${page}): ${result.error}`);
    const parsed = extractItems(result.data);
    reportedTotal = parsed.total;
    fetched += parsed.items.length;
    for (const item of parsed.items) {
      const row = normalize(item, keyword);
      if (row) collected.push(row);
    }
    if (page * pageSize >= reportedTotal || !parsed.items.length) break;
    if (page === limitPages) throw new Error("50페이지 안전 제한에 도달했습니다. 조건을 분할해 다시 수집하세요.");
  }
  const latest = new Map<string, DeliveryItem>();
  for (const row of collected) {
    const previous = latest.get(row.external_key);
    if (!previous || compareVersions(row, previous) > 0) latest.set(row.external_key, row);
  }
  const rows = [...latest.values()].sort((a, b) => a.receipt_date.localeCompare(b.receipt_date));
  if (persist && rows.length) {
    const db = getSupabaseAdmin();
    if (!db) throw new Error("Supabase admin database is unavailable");
    // Avoid overwriting a newer change order already collected in another month.
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const keys = chunk.map(row => row.external_key);
      const existing = await db.from("virtualization_delivery_items")
        .select("external_key,delivery_change_order,receipt_date").in("external_key", keys);
      if (existing.error) throw new Error(existing.error.message);
      const prior = new Map((existing.data ?? []).map((e: any) => [e.external_key, e]));
      const writable = chunk.filter(row => {
        const item = prior.get(row.external_key) as { delivery_change_order: string | null; receipt_date: string } | undefined;
        return !item || compareVersions(row, { ...row, delivery_change_order: item.delivery_change_order, receipt_date: item.receipt_date }) >= 0;
      });
      if (writable.length) {
        const result = await db.from("virtualization_delivery_items").upsert(writable as never, { onConflict: "external_key" });
        if (result.error) throw new Error(result.error.message);
      }
    }
  }
  return { ok: true, year, month, keyword, requests, fetched, reportedTotal, matched: rows.length, saved: persist ? rows.length : 0, rows: persist ? [] : rows.slice(0, 30) };
}
