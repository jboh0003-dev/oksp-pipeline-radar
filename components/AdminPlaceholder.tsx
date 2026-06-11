"use client";

import { useAuth } from "@/lib/auth";

/**
 * 관리자 메뉴 placeholder — 사이드바의 4개 admin 항목이 공통으로 사용하는 빈 화면.
 *
 *  - 이번 phase 는 "메뉴 노출 제어" 까지만 — 실제 기능(사용자 관리 / 키워드 룰 / 수집 초기화 등) 은
 *    다음 phase 에서 한다.
 *  - admin role 만 보이는 메뉴이지만, 비-admin 사용자가 URL 을 직접 입력해서 들어왔을 때는
 *    "권한 없음" 안내로 화면 자체를 막는다 (서버측 RLS 강제는 다음 phase).
 */

type Props = {
  title: string;
  description?: string;
};

export default function AdminPlaceholder({ title, description }: Props) {
  const { isAdmin, status } = useAuth();

  // 세션 확인 중엔 빈 화면 (AppShell 가 더 큰 splash 를 처리하므로 여기선 단출하게).
  if (status === "loading") {
    return null;
  }

  if (!isAdmin) {
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
          이 화면은 관리자(admin) 만 접근할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-300">
          OKESTRO CS-G2B · 관리자
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-semibold">준비 중</p>
          <p className="mt-1 text-[12px] leading-relaxed">
            이 화면은 다음 단계에서 구현됩니다. 현재는 admin role 사용자에게 메뉴만 노출되어 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
