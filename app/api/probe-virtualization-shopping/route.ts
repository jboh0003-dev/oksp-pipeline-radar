import { NextResponse } from "next/server";
import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";

// Temporary preview-only read-only capability check. Remove before merge.
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const BASE = "https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService";

function minimalItems(data: unknown): Array<Record<string, unknown>> {
  const root = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const response = root.response && typeof root.response === "object" ? root.response as Record<string, unknown> : root;
  const body = response.body && typeof response.body === "object" ? response.body as Record<string, unknown> : {};
  const wrapper = body.items && typeof body.items === "object" ? body.items as Record<string, unknown> : {};
  const items = wrapper.item ?? body.items;
  const rows = Array.isArray(items) ? items : items && typeof items === "object" ? [items] : [];
  return rows.slice(0, 3).map((value) => {
    const x = value as Record<string, unknown>;
    return {
      dlvrReqNo: String(x.dlvrReqNo ?? ""),
      product: String(x.prdctIdntNoNm ?? ""),
      receiptDate: String(x.dlvrReqRcptDate ?? ""),
      supplier: String(x.corpNm ?? ""),
      customer: String(x.dminsttNm ?? ""),
      amount: String(x.prdctAmt ?? ""),
    };
  });
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const key = process.env.G2B_SERVICE_KEY?.trim();
  if (!key) return NextResponse.json({ ok: false, error: "G2B key not configured" }, { status: 503 });
  const args = [
    { month: "2025-06", keyword: "에이블스택" },
    { month: "2026-05", keyword: "ABLESTACK" },
    { month: "2026-08", keyword: "클라우드잇" },
  ];
  const responses = [];
  for (const task of args) {
    const start = task.month.replace("-", "") + "01";
    const endDate = new Date(Date.UTC(Number(task.month.slice(0, 4)), Number(task.month.slice(5, 7)), 0));
    const end = task.month.replace("-", "") + String(endDate.getUTCDate()).padStart(2, "0");
    const url = buildG2bUrl(BASE, "getDlvrReqDtlInfoList", {
      serviceKey: key, type: "json", inqryDiv: 1, inqryBgnDate: start, inqryEndDate: end,
      prdctIdntNoNm: task.keyword, pageNo: 1, numOfRows: 3,
    });
    const result = await fetchG2bApi(url, { timeoutMs: 13000, retries: 1, label: "shopping-verify" });
    responses.push(result.ok
      ? { ...task, ok: true, status: result.debug.status, code: result.debug.resultCode,
          totalCount: result.debug.totalCount, items: minimalItems(result.data) }
      : { ...task, ok: false, status: result.debug.status, error: result.error,
          code: result.debug.resultCode });
    // Authentication failure is service-wide, so do not waste other API calls.
    if (!result.ok && /SERVICE_KEY|KEY_IS_NOT|NOT_REGISTERED|NOT_ALLOWED|HTTP 403|HTTP 401/i.test(result.error)) break;
  }
  return NextResponse.json({ ok: responses.every(x => x.ok), responses }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
