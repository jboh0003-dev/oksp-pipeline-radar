import { NextRequest, NextResponse } from "next/server";
import { collectVirtualizationDeliveryMonth, VIRTUALIZATION_KEYWORDS } from "@/lib/g2b/virtualizationDeliveries";
import { kstTodayYmd } from "@/lib/g2b/competitiveAwards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest, context: { params: Promise<{ offset: string }> }) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "수집 설정 누락" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const { offset: raw } = await context.params;
  if (!/^[012]$/.test(raw)) return NextResponse.json({ ok: false }, { status: 400 });
  const today = kstTodayYmd();
  const date = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - Number(raw), 1));
  const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;
  let cursor = 0;
  const results: Array<{ keyword: string; matched: number; error?: string }> = new Array(VIRTUALIZATION_KEYWORDS.length);
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < VIRTUALIZATION_KEYWORDS.length) {
      const index = cursor++;
      const keyword = VIRTUALIZATION_KEYWORDS[index];
      try {
        const result = await collectVirtualizationDeliveryMonth(year, month, keyword, true);
        results[index] = { keyword, matched: result.matched };
      } catch (error) {
        results[index] = { keyword, matched: 0, error: error instanceof Error ? error.message : "수집 실패" };
      }
    }
  }));
  const errors = results.filter(result => result.error);
  return NextResponse.json({ ok: errors.length === 0, year, month, completed: results.length - errors.length, total: results.length,
    matched: results.reduce((sum, result) => sum + result.matched, 0), errors }, { status: errors.length ? 502 : 200 });
}
