import { NextResponse } from "next/server";
import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const COMPANIES = [
  { name: "이노그리드", bizno: "2208736743" },
  { name: "에이블클라우드", bizno: "8868602158" },
] as const;
const KINDS = [
  ["용역", "getScsbidListSttusServcPPSSrch"],
  ["물품", "getScsbidListSttusThngPPSSrch"],
  ["공사", "getScsbidListSttusCnstwkPPSSrch"],
  ["외자", "getScsbidListSttusFrgcptPPSSrch"],
] as const;

function parse(raw: string) {
  const json = JSON.parse(raw) as any;
  const response = json?.response ?? json;
  const body = response?.body ?? {};
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
    totalCount: Number(body?.totalCount ?? 0),
    items: items.map((x: any) => ({
      bidNtceNo: x?.bidNtceNo,
      bidNtceOrd: x?.bidNtceOrd,
      bidNtceNm: x?.bidNtceNm,
      bidwinnrNm: x?.bidwinnrNm,
      bidwinnrBizno: x?.bidwinnrBizno,
      sucsfbidAmt: x?.sucsfbidAmt,
      sucsfbidRate: x?.sucsfbidRate,
      rlOpengDt: x?.rlOpengDt,
      fnlSucsfDate: x?.fnlSucsfDate,
      dminsttNm: x?.dminsttNm,
    })),
  };
}

export async function GET() {
  const key = process.env.G2B_SERVICE_KEY?.trim();
  if (!key) return NextResponse.json({ ok: false, error: "G2B_SERVICE_KEY missing" }, { status: 500 });

  const out = [];
  for (const company of COMPANIES) {
    for (const [kind, op] of KINDS) {
      const url = buildG2bUrl(BASE, op, {
        serviceKey: key,
        pageNo: 1,
        numOfRows: 100,
        type: "json",
        inqryDiv: 2,
        inqryBgnDt: "202301010000",
        inqryEndDt: "202609162359",
        bizno: company.bizno,
      });
      const r = await fetchG2bApi(url, { timeoutMs: 12000, retries: 1, label: `award-probe-${company.name}-${kind}` });
      if (!r.ok) {
        out.push({ company: company.name, bizno: company.bizno, kind, ok: false, error: r.error, debug: r.debug });
        continue;
      }
      const parsed = parse(r.raw);
      out.push({ company: company.name, bizno: company.bizno, kind, ok: true, totalCount: parsed.totalCount, sample: parsed.items.slice(0, 5) });
    }
  }

  return NextResponse.json({ ok: true, out });
}
