import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminFailResponse } from "@/lib/apiAuth";
import { collectVirtualizationAwardCandidatesMonth } from "@/lib/g2b/virtualizationAwardCandidates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  const body = await request.json().catch(()=>({}));
  try {
    const result = await collectVirtualizationAwardCandidatesMonth(Number(body.year),Number(body.month),body.persist===true);
    return NextResponse.json(result,{status:result.ok?200:502,headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});
  }
}
