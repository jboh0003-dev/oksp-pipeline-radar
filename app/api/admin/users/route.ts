import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminFailResponse } from "@/lib/apiAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin client unavailable" }, { status: 500 });

  const [{ data: authData, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 200 }),
    supabase.from("profiles").select("id,email,name,department,role,created_at").order("created_at", { ascending: true }),
  ]);

  if (authError) return NextResponse.json({ ok: false, error: authError.message }, { status: 500 });
  if (profileError) return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const users = (authData.users ?? []).map((user) => {
    const profile = profileMap.get(user.id) as any;
    return {
      id: user.id,
      email: user.email ?? profile?.email ?? "",
      name: profile?.name ?? "",
      department: profile?.department ?? "",
      role: profile?.role === "admin" ? "admin" : "user",
      created_at: profile?.created_at ?? user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      isCurrent: user.id === auth.userId,
    };
  });

  return NextResponse.json({ ok: true, users });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin client unavailable" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  const role = body.role === "admin" ? "admin" : body.role === "user" ? "user" : null;
  if (!userId || !role) return NextResponse.json({ ok: false, error: "userId/role 확인 필요" }, { status: 400 });
  if (userId === auth.userId && role !== "admin") {
    return NextResponse.json({ ok: false, error: "현재 로그인한 관리자 본인의 admin 권한은 해제할 수 없습니다." }, { status: 400 });
  }

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, error: userError?.message ?? "사용자를 찾지 못했습니다." }, { status: 404 });
  }

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    email: userData.user.email ?? null,
    role,
  }, { onConflict: "id" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, userId, role });
}


/** 관리자 계정 발급: 인증 사용자 생성 후 일반 사용자 프로필 등록. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return adminFailResponse(auth);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "계정 관리 설정이 누락됐습니다." }, { status: 503 });
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ ok: false, error: "올바른 이메일 주소를 입력해 주세요." }, { status: 400 });
  if (password.length < 10 || password.length > 128)
    return NextResponse.json({ ok: false, error: "비밀번호는 10~128자로 설정해 주세요." }, { status: 400 });

  const { data, error: createError } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createError || !data.user) {
    const duplicate = /already|registered|exists/i.test(createError?.message ?? "");
    return NextResponse.json({ ok: false, error: duplicate ? "이미 등록된 이메일입니다." : "계정 생성에 실패했습니다." }, { status: duplicate ? 409 : 500 });
  }
  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: data.user.id, email, role: "user" }, { onConflict: "id" },
  );
  if (profileError) {
    const { error: rollbackError } = await supabase.auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ ok: false, error: rollbackError
      ? "인증 계정은 생성됐지만 사용자 정보 저장에 실패했습니다. 관리자 확인이 필요합니다."
      : "사용자 정보 저장 실패로 계정 생성을 취소했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, user: { id: data.user.id, email, role: "user" } }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
