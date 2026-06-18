import AdminGuard from "@/components/AdminGuard";

/**
 * /admin/** 모든 라우트는 이 layout 을 거친다.
 *
 *  - AdminGuard 가 클라이언트 측에서 isAdmin 검사를 실행.
 *  - 비-admin 사용자는 접근 차단 화면 → 자동으로 "/" 로 redirect.
 *  - 단순 메뉴 hide 가 아니라 URL 직접 입력으로 들어온 경우에도 차단된다.
 *
 * 서버측 RLS 강제는 supabase 의 profiles RLS + service_role 분리로 처리한다.
 * 이 layout 은 사용자 경험(UX) 차원의 가드.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminGuard>{children}</AdminGuard>;
}
