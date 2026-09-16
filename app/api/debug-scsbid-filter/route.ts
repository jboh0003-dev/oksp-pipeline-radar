import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function mask(value: string) {
  return value ? `${value.slice(0, 4)}…${value.slice(-4)}` : "";
}

export async function GET() {
  const serviceKey = process.env.G2B_SERVICE_KEY?.trim();
  if (!serviceKey) return NextResponse.json({ ok: false, error: "missing G2B_SERVICE_KEY" }, { status: 500 });

  const base = "https://apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttusServcPPSSrch";
  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "100",
    inqryDiv: "2",
    inqryBgnDt: "202601010000",
    inqryEndDt: "202601312359",
    bidwinnrNm: "이노그리드",
    type: "json",
  });
  try {
    const res = await fetch(`${base}?${params.toString()}`, { cache: "no-store" });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    const body = json?.response?.body;
    const itemsRaw = body?.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw?.item ? (Array.isArray(itemsRaw.item) ? itemsRaw.item : [itemsRaw.item]) : itemsRaw ? [itemsRaw] : [];
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      key: mask(serviceKey),
      resultCode: json?.response?.header?.resultCode ?? null,
      resultMsg: json?.response?.header?.resultMsg ?? null,
      totalCount: body?.totalCount ?? null,
      sample: items.slice(0, 10).map((x: any) => ({
        bidNtceNo: x.bidNtceNo,
        bidNtceNm: x.bidNtceNm,
        bidwinnrNm: x.bidwinnrNm,
        bidwinnrBizno: x.bidwinnrBizno,
        sucsfbidAmt: x.sucsfbidAmt,
        fnlSucsfDate: x.fnlSucsfDate,
        dminsttNm: x.dminsttNm,
      })),
      rawPrefix: json ? undefined : text.slice(0, 300),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
