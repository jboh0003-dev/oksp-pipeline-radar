import { NextResponse } from "next/server";
import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const TESTS = [
  { name: "이노그리드", bizno: "2208736743" },
  { name: "에이블클라우드", bizno: "8868602158" },
] as const;
const OPS = ["getScsbidListSttusServcPPSSrch", "getScsbidListSttusThngPPSSrch"] as const;
function itemsOf(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const response = (root.response && typeof root.response === "object" ? root.response : root) as Record<string, unknown>;
  const body = response.body && typeof response.body === "object" ? response.body as Record<string, unknown> : {};
  const items = body.items;
  if (!items) return [];
  if (Array.isArray(items)) return items.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (typeof items === "object") {
    const item = (items as Record<string, unknown>).item;
    if (Array.isArray(item)) return item.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
    if (item && typeof item === "object") return [item as Record<string, unknown>];
  }
  return [];
}
export async function GET() {
  const key = process.env.G2B_SERVICE_KEY?.trim();
  if (!key) return NextResponse.json({ ok: false, error: "G2B_SERVICE_KEY missing" }, { status: 500 });
  const out = [];
  for (const company of TESTS) for (const op of OPS) {
    const url = buildG2bUrl(BASE, op, { serviceKey: key, pageNo: 1, numOfRows: 10, inqryDiv: 1, inqryBgnDt: "202601010000", inqryEndDt: "202609162359", bizno: company.bizno, type: "json" });
    const r = await fetchG2bApi(url, { timeoutMs: 12000, retries: 1, label: `award-${op}` });
    out.push(r.ok ? { company: company.name, op, ok: true, status: r.debug.status, resultCode: r.debug.resultCode, totalCount: r.debug.totalCount, items: itemsOf(r.data).slice(0, 3).map((x) => ({ bidNtceNo:x.bidNtceNo,bidNtceOrd:x.bidNtceOrd,bidNtceNm:x.bidNtceNm,bidwinnrNm:x.bidwinnrNm,bidwinnrBizno:x.bidwinnrBizno,sucsfbidAmt:x.sucsfbidAmt,sucsfbidRate:x.sucsfbidRate,rlOpengDt:x.rlOpengDt,fnlSucsfDate:x.fnlSucsfDate,dminsttNm:x.dminsttNm })) } : { company: company.name, op, ok: false, error: r.error, kind: r.errorKind, debug: r.debug });
  }
  return NextResponse.json({ ok: true, out });
}
