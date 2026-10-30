import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminFailResponse } from "@/lib/apiAuth";
import { collectVirtualizationAwardCandidatesMonth, VIRTUALIZATION_BID_KEYWORD_GROUPS, type VendorKeywordGroup } from "@/lib/g2b/virtualizationAwardCandidates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  const body = await request.json().catch(()=>({}));
  try {
    const group = String(body.group ?? "core");
    if (!Object.prototype.hasOwnProperty.call(VIRTUALIZATION_BID_KEYWORD_GROUPS, group)) {
      return NextResponse.json({ok:false,error:"지원되지 않는 벤더 검색그룹입니다."},{status:400});
    }
    const result = await collectVirtualizationAwardCandidatesMonth(
      Number(body.year),Number(body.month),body.persist===true,group as VendorKeywordGroup
    );
    return NextResponse.json(result,{status:result.ok?200:502,headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});
  }
}
