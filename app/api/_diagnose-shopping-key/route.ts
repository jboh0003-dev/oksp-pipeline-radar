import { NextResponse } from "next/server";
import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const secret = process.env.G2B_SERVICE_KEY?.trim();
  if (!secret) return NextResponse.json({ ok: false, missing: "G2B_SERVICE_KEY" }, { status: 500 });
  const base = "https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService";
  const checks = [];
  for (const name of ["serviceKey", "ServiceKey"]) {
    const url = buildG2bUrl(base, "getDlvrReqDtlInfoList", {
      [name]: secret, type: "json", inqryDiv: "1",
      inqryBgnDate: "20250601", inqryEndDate: "20250630",
      prdctIdntNoNm: "에이블스택", pageNo: "1", numOfRows: "2",
    });
    const result = await fetchG2bApi(url, { retries: 1, timeoutMs: 16000, label: "shop-key-diagnostic" });
    checks.push({
      paramName: name,
      status: result.debug.status,
      resultCode: result.debug.resultCode,
      resultMsg: result.debug.resultMsg?.slice(0, 100) ?? null,
      totalCount: result.debug.totalCount,
      ok: result.ok,
      error: result.ok ? null : result.error.slice(0, 240),
    });
  }
  return NextResponse.json({
    api: "ShoppingMallPrdctInfoService/getDlvrReqDtlInfoList",
    environment: "preview", checks, keyLastChanged: "Vercel project secret metadata",
  }, { headers: { "Cache-Control": "no-store" } });
}
