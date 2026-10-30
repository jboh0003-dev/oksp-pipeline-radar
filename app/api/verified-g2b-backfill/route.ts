import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedBackfillWorkflow } from "@/lib/githubOidcAuth";
import { collectCompetitiveAwards, kstTodayYmd } from "@/lib/g2b/competitiveAwards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Intentionally preview-only. A GitHub Actions OIDC token must match the exact
// owner, repository ID, branch, workflow file, audience and short validity.
export async function POST(request: NextRequest) {
  if (!await isAuthorizedBackfillWorkflow(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const payload = await request.json().catch(() => ({}));
  const year = Number(payload.year);
  const month = Number(payload.month);
  const persist = payload.persist === true;
  if (![2024, 2025, 2026].includes(year) || !Number.isInteger(month) || month < 1 || month > 12 || (year === 2026 && month > 10)) {
    return NextResponse.json({ ok: false, error: "Month out of range" }, { status: 400 });
  }
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = [`${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`, kstTodayYmd()].sort()[0];
  try {
    const result = await collectCompetitiveAwards({ startDate, endDate, persist, concurrency: 6, categories: ["물품", "용역"] });
    const stats = {
      ok: result.ok, year, month, persist, coverage: "goods_and_services",
      requestCount: result.requestCount,
      fetchedCount: result.fetchedCount,
      verifiedCount: result.verifiedCount,
      dedupedCount: result.dedupedCount,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      failedTaskCount: result.failedTaskCount,
      skippedMismatchCount: result.skippedMismatchCount,
      companyCounts: result.companyCounts,
      errors: result.errors.slice(0, 20),
      preview: !persist ? result.rows.slice(0, 8).map(row => ({
        date: row.award_date, competitor: row.competitor, bid_no: row.bid_no,
        project: row.project, customer: row.customer, amount: row.amount,
      })) : [],
    };
    return NextResponse.json(stats, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ ok: false, year, month, persist, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
