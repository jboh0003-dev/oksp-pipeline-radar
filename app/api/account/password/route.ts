import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const respond = (ok: boolean, error?: string, status = 200) =>
  NextResponse.json(ok ? { ok: true } : { ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

/** 본인 비밀번호 변경: 세션 + 현재 비밀번호 모두 확인합니다. */
export async function POST(request: NextRequest) {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return respond(false, "로그인 후 다시 시도해 주세요.", 401);
  const admin = getSupabaseAdmin();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!admin || !url || !anonKey) return respond(false, "인증 설정이 누락됐습니다.", 503);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user?.email) return respond(false, "로그인 세션을 확인할 수 없습니다.", 401);

  const body = await request.json().catch(() => null);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword) return respond(false, "현재 비밀번호를 입력해 주세요.", 400);
  if (newPassword.length < 10 || newPassword.length > 128) return respond(false, "새 비밀번호는 10~128자로 설정해 주세요.", 400);
  if (newPassword === currentPassword) return respond(false, "기존 비밀번호와 다른 비밀번호를 입력해 주세요.", 400);

  // 현재 브라우저 세션에 영향을 주지 않는 비영속 클라이언트로 현재 비밀번호 확인.
  const verifier = createClient(url, anonKey, { auth: {
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
  } });
  const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
    email: auth.user.email, password: currentPassword,
  });
  if (verifyError || verified.user?.id !== auth.user.id) return respond(false, "현재 비밀번호가 일치하지 않습니다.", 401);
  const { error: updateError } = await admin.auth.admin.updateUserById(auth.user.id, { password: newPassword });
  if (updateError) return respond(false, "비밀번호 변경에 실패했습니다.", 500);
  return respond(true);
}
