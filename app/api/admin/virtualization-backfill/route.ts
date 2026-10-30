import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminFailResponse } from "@/lib/apiAuth";
import { collectVirtualizationDeliveryMonth, VIRTUALIZATION_KEYWORDS } from "@/lib/g2b/virtualizationDeliveries";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(request: NextRequest, persist: boolean) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  try {
    const params = persist ? await request.json() : Object.fromEntries(request.nextUrl.searchParams);
    const year = Number(params.year);
    const month = Number(params.month);
    const keyword = String(params.keyword ?? "").trim();
    if (!VIRTUALIZATION_KEYWORDS.some((item) => item === keyword))
      return NextResponse.json({ ok: false, error: "지원되지 않는 검색어입니다.", keywords: VIRTUALIZATION_KEYWORDS }, { status: 400 });
    const result = await collectVirtualizationDeliveryMonth(year, month, keyword, persist);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
// GET is a read-only probe and never changes operational data.
export async function GET(request: NextRequest) { return run(request, false); }
// POST explicitly persists the single requested month and product keyword.
export async function POST(request: NextRequest) { return run(request, true); }
