/**
 * 서버 단 API 권한 가드.
 *
 * 사용처:
 *  - admin 만 호출 가능한 API (수동 수집, 수집 초기화, 키워드 룰 관리, 사용자 role 변경 등).
 *
 * 흐름:
 *  1) 클라이언트가 fetch 시 Authorization: Bearer <Supabase Access Token> 을 함께 보낸다.
 *     (lib/auth.ts 의 useAuth() 가 보유한 session.access_token)
 *  2) 서버에서 supabaseAdmin.auth.getUser(token) 으로 JWT 를 검증 → user.id 획득.
 *  3) profiles.role === 'admin' 인지 조회.
 *  4) 결과를 { ok, user, role, reason } 형태로 반환.
 *
 * 반환:
 *   ok=true  : admin 검증 통과. handler 가 요청을 처리.
 *   ok=false : 401(인증 누락) / 403(역할 부족) / 500(환경설정 오류).
 *              호출부는 NextResponse.json(...) 으로 즉시 반환하면 된다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type RequireAdminOk = {
  ok: true;
  userId: string;
  email: string | null;
};

export type RequireAdminFail = {
  ok: false;
  status: 401 | 403 | 500;
  reason: string;
};

export type RequireAdminResult = RequireAdminOk | RequireAdminFail;

/**
 * Authorization: Bearer 헤더에서 Supabase JWT 추출.
 * 헤더가 없거나 Bearer 형태가 아니면 null.
 */
function extractBearerToken(request: NextRequest): string | null {
  const raw =
    request.headers.get("authorization") ??
    request.headers.get("Authorization") ??
    "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * 현재 요청이 admin role 사용자가 보낸 것인지 검증.
 *
 *  - 인증 토큰이 없거나 잘못됐으면 401.
 *  - profiles.role !== 'admin' 이면 403.
 *  - Supabase admin client 를 만들 수 없으면 500 (환경 설정 누락).
 */
export async function requireAdmin(request: NextRequest): Promise<RequireAdminResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      ok: false,
      status: 500,
      reason:
        "Supabase admin client 환경변수 누락 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      reason:
        "Authorization 헤더가 없습니다. 로그인 후 다시 시도해 주세요. (Authorization: Bearer <Supabase access_token>)",
    };
  }

  // JWT 검증 — 만료/위조 토큰이면 user 가 null 또는 error 발생.
  const { data: userResp, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userResp?.user) {
    return {
      ok: false,
      status: 401,
      reason: "유효하지 않은 인증 토큰입니다. 다시 로그인 해주세요.",
    };
  }
  const userId = userResp.user.id;
  const email = userResp.user.email ?? null;

  // profiles 조회 — row 가 없으면 user 로 폴백 (= admin 아님).
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) {
    return {
      ok: false,
      status: 500,
      reason: `profiles 조회 실패: ${profileErr.message}`,
    };
  }
  const role =
    (profile as { role?: string | null } | null)?.role === "admin" ? "admin" : "user";
  if (role !== "admin") {
    return {
      ok: false,
      status: 403,
      reason: "관리자 권한이 필요합니다.",
    };
  }

  return { ok: true, userId, email };
}

/**
 * requireAdmin 결과가 실패면 적절한 NextResponse 를 만들어 돌려준다.
 * 호출부에서 한 줄로:
 *
 *   const r = await requireAdmin(request);
 *   if (!r.ok) return adminFailResponse(r);
 */
export function adminFailResponse(result: RequireAdminFail): NextResponse {
  return NextResponse.json(
    { ok: false, error: result.reason },
    { status: result.status },
  );
}
