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
