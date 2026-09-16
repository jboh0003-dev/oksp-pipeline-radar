import { NextResponse } from "next/server";
import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const OP = "getScsbidListSttusServcPPSSrch";

type Case = { label: string; params: Record<string, string | number | undefined> };

function summarizeRaw(raw: string) {
  try {
    const json = JSON.parse(raw) as any;
    const response = json?.response ?? json;
    const body = response?.body ?? null;
    const rawItems = body?.items;
    const items = Array.isArray(rawItems)
      ? rawItems
      : Array.isArray(rawItems?.item)
        ? rawItems.item
        : rawItems?.item
          ? [rawItems.item]
          : rawItems
            ? [rawItems]
            : [];
    return {
      header: response?.header ?? null,
      totalCount: body?.totalCount ?? null,
      pageNo: body?.pageNo ?? null,
      numOfRows: body?.numOfRows ?? null,
      itemCount: items.length,
      sample: items.slice(0, 3).map((x: any) => ({
        bidNtceNo: x?.bidNtceNo,
        bidNtceOrd: x?.bidNtceOrd,
        bidNtceNm: x?.bidNtceNm,
        bidwinnrNm: x?.bidwinnrNm,
        bidwinnrBizno: x?.bidwinnrBizno,
        sucsfbidAmt: x?.sucsfbidAmt,
        fnlSucsfDate: x?.fnlSucsfDate,
        dminsttNm: x?.dminsttNm,
      })),
      rootKeys: Object.keys(json ?? {}).slice(0, 10),
      responseKeys: response && typeof response === "object" ? Object.keys(response).slice(0, 10) : [],
    };
  } catch {
    return { rawPrefix: raw.slice(0, 300) };
  }
}

export async function GET() {
  const key = process.env.G2B_SERVICE_KEY?.trim();
  if (!key) return NextResponse.json({ ok: false, error: "G2B_SERVICE_KEY missing" }, { status: 500 });

  const common = {
    serviceKey: key,
    pageNo: 1,
    numOfRows: 20,
    type: "json",
  };

  const cases: Case[] = [
    {
      label: "jan-no-filter",
      params: { ...common, inqryDiv: 2, inqryBgnDt: "202601010000", inqryEndDt: "202601312359" },
    },
    {
      label: "jan-bizno",
      params: { ...common, inqryDiv: 2, inqryBgnDt: "202601010000", inqryEndDt: "202601312359", bizno: "2208736743" },
    },
    {
      label: "jan-bidwinnrBizno",
      params: { ...common, inqryDiv: 2, inqryBgnDt: "202601010000", inqryEndDt: "202601312359", bidwinnrBizno: "2208736743" },
    },
    {
      label: "jan-bidwinnrNm",
      params: { ...common, inqryDiv: 2, inqryBgnDt: "202601010000", inqryEndDt: "202601312359", bidwinnrNm: "이노그리드" },
    },
    {
      label: "known-notice",
      params: { ...common, inqryDiv: 3, bidNtceNo: "R26BK01525553" },
    },
  ];

  const out = [];
  for (const c of cases) {
    const url = buildG2bUrl(BASE, OP, c.params);
    const r = await fetchG2bApi(url, { timeoutMs: 12000, retries: 1, label: `award-probe-${c.label}` });
    out.push(
      r.ok
        ? { label: c.label, ok: true, status: r.debug.status, resultCode: r.debug.resultCode, ...summarizeRaw(r.raw) }
        : { label: c.label, ok: false, error: r.error, kind: r.errorKind, debug: r.debug },
    );
  }

  return NextResponse.json({ ok: true, out });
}
