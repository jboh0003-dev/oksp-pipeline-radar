import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedBackfillWorkflow } from "@/lib/githubOidcAuth";
import { collectVirtualizationAwardCandidatesMonth } from "@/lib/g2b/virtualizationAwardCandidates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  if (!await isAuthorizedBackfillWorkflow(request)) {
    return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
  }
  const body = await request.json().catch(()=>({}));
  const year = Number(body.year), month = Number(body.month), persist = body.persist === true;
  try {
    const result = await collectVirtualizationAwardCandidatesMonth(year,month,persist);
    return NextResponse.json(result,{status:result.ok?200:502,headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    return NextResponse.json({ok:false,year,month,error:error instanceof Error?error.message:String(error)},{status:500});
  }
}
