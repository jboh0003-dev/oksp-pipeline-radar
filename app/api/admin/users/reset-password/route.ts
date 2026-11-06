import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminFailResponse } from "@/lib/apiAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/** 관리자는 타 사용자 비밀번호를 재설정할 수 있습니다. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
    return NextResponse.json({ ok: false, error: "사용자 정보를 확인해 주세요." }, { status: 400 });
  if (userId === auth.userId)
    return NextResponse.json({ ok: false, error: "본인 비밀번호는 '내 비밀번호 변경' 메뉴에서 변경해 주세요." }, { status: 400 });
  if (password.length < 10 || password.length > 128)
    return NextResponse.json({ ok: false, error: "비밀번호는 10~128자로 설정해 주세요." }, { status: 400 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "계정 관리 설정이 누락됐습니다." }, { status: 503 });
  const { data: target, error: lookupError } = await supabase.auth.admin.getUserById(userId);
  if (lookupError || !target.user) return NextResponse.json({ ok: false, error: "사용자를 찾지 못했습니다." }, { status: 404 });
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) return NextResponse.json({ ok: false, error: "비밀번호 변경에 실패했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
