"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

/**
 * /admin/** 화면을 감싸는 클라이언트 가드.
 *
 *  - useAuth() 의 status / role 을 보고 admin 이 아니면 즉시 "/" 로 redirect.
 *  - profile fetch 가 끝나기 전(profileStatus="loading") 에는 대기 화면.
 *  - admin 이면 children 렌더.
 *  - URL 직접 접근 (예: 일반 사용자가 /admin/users 를 주소창에 입력) 도 차단된다.
 *
 * Note: 클라이언트 side guard 라 자바스크립트가 비활성화된 환경에선 placeholder 만 보인다.
 *       수집/사용자 변경 등 실제 admin 동작을 막는 server side 가드는 lib/apiAuth.ts 의
 *       requireAdmin 으로 별도 처리 — 이 가드를 우회한다 해도 admin API 자체는 호출 불가.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    // 인증 정보 로딩 / 미로그인 상태에서는 redirect 하지 않는다 (loading 화면 / 로그인 화면이 그릴 것).
    if (auth.status !== "authed") return;
    // profile fetch 가 끝났는데 admin 이 아니면 즉시 홈으로.
    if (auth.profileStatus === "ready" && !auth.isAdmin) {
      router.replace("/");
    }
  }, [auth.status, auth.profileStatus, auth.isAdmin, router]);

  // 인증 미정 / profile fetch 중 — 깜빡임 방지 미니 splash.
  if (
    auth.status === "loading" ||
    (auth.status === "authed" && auth.profileStatus !== "ready")
  ) {
    return (
      <div
        aria-busy
        className="flex min-h-[60vh] items-center justify-center text-xs text-slate-500 dark:text-slate-400"
      >
        권한 확인 중…
      </div>
    );
  }

  // 미로그인 — AppShell 의 LoginScreen 이 더 상위에서 처리하므로 여기 도달하면 fallback.
  if (auth.status !== "authed") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">로그인이 필요합니다</h1>
      </div>
    );
  }

  // 로그인 + 일반 사용자 — 권한 없음 화면 (잠시 후 자동 redirect).
  if (!auth.isAdmin) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <span
          aria-hidden
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-500 ring-1 ring-inset ring-rose-400/30"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">권한이 없습니다</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          이 화면은 관리자(admin) 만 접근할 수 있습니다. 잠시 후 대시보드로 이동합니다.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/")}
          className="mt-2 inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
        >
          대시보드로 이동
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
