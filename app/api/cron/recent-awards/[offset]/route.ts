import { NextRequest, NextResponse } from "next/server";
import { collectVirtualizationAwardCandidatesMonth } from "@/lib/g2b/virtualizationAwardCandidates";
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
  try {
    const [result, paas] = await Promise.all(["core", "paas"].map(group => collectVirtualizationAwardCandidatesMonth(date.getUTCFullYear(), date.getUTCMonth() + 1, true, group as "core" | "paas", true)));
    return NextResponse.json({ ok: result.ok && paas.ok, year: result.year, month: result.month, matchedCount: result.matchedCount + paas.matchedCount, insertedCount: result.insertedCount + paas.insertedCount, updatedCount: result.updatedCount + paas.updatedCount, errors: [...result.errors, ...paas.errors] }, { status: result.ok && paas.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "수집 실패" }, { status: 502 });
  }
}
