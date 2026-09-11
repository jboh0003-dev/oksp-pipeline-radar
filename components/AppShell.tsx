"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import LoginScreen from "@/components/LoginScreen";
import { useAuth } from "@/lib/auth";

/**
 * 사이드바 네비게이션 — Pipeline Maker의 모든 화면이 공통으로 갖는 좌측 메뉴.
 *
 * 메뉴:
 *  - 입찰공고       (/)                     : 나라장터 입찰공고
 *  - 사전규격공고   (/pre-spec)             : 사전규격 단계의 공고 (조달청 사전규격정보서비스)
 *  - 수주·경쟁분석  (/competitive-analysis) : 경쟁사 수주·SI 협업 분석
 *  - 피드백         (/feedback)             : 영업이 남긴 피드백 모아보기
 *
 * 데스크톱(lg+): 사이드바 고정(240px), 본문은 우측에 grid 로 배치.
 * 모바일(<lg)  : 햄버거 토글 → fixed overlay 형태로 슬라이드.
 *
 * 디자인 톤:
 *  - 다크 navy 패널 (입찰 대시보드 헤더 톤과 통일).
 *  - 활성 메뉴: 좌측 4px cyan 강조선 + 살짝 밝은 배경.
 *  - 상단에는 Pipeline Maker 브랜드와 나라장터 보조명을 표시.
 *
 * 인증 게이트:
 *  - useAuth() 가 status="authed" 일 때만 사이드바+본문을 렌더한다.
 *  - "loading"   : 화면 깜빡임을 줄이기 위한 미니 스플래시.
 *  - "unauthed"  : LoginScreen 만 노출.
 *  - "missing-config" : LoginScreen 에 안내 메시지 노출.
 *  - 로그인 성공 후 좌측 하단에 사용자 이메일 + 로그아웃 버튼이 표시된다.
 */

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  scope?: "all" | "admin";
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "입찰공고",
    description: "나라장터 입찰공고",
    scope: "all",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 12h3l3-7 4 14 3-7h5" />
      </svg>
    ),
  },
  {
    href: "/pre-spec",
    label: "사전규격공고",
    description: "사전규격 조기탐지",
    scope: "all",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    ),
  },
  {
    href: "/competitive-analysis",
    label: "수주·경쟁분석",
    description: "경쟁사 수주·SI 협업 분석",
    scope: "all",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M18 20V10" />
        <path d="M12 20V4" />
        <path d="M6 20v-6" />
      </svg>
    ),
  },
  {
    href: "/feedback",
    label: "피드백 현황",
    description: "영업 의견 모아보기",
    scope: "all",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/admin",
    label: "관리자 설정",
    description: "운영 옵션 / 진단",
    scope: "admin",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.2a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.2a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "사용자 관리",
    description: "role / 계정",
    scope: "admin",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/admin/keywords",
    label: "키워드 규칙",
    description: "매칭 룰 관리",
    scope: "admin",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    href: "/admin/collection-reset",
    label: "수집 상태 초기화",
    description: "snapshot / 캐시 reset",
    scope: "admin",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    ),
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const auth = useAuth();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  if (auth.status === "loading") {
    return (
      <div
        aria-busy
        className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300"
      >
        <span className="text-xs">세션 확인 중…</span>
      </div>
    );
  }
  if (auth.status === "unauthed" || auth.status === "missing-config") {
    return (
      <LoginScreen
        configError={auth.configError}
        signInWithPassword={auth.signInWithPassword}
      />
    );
  }

  const userEmail = auth.session?.user?.email ?? "(이메일 없음)";
  const role = auth.role;
  const isAdmin = auth.isAdmin;
  const visibleNavItems = NAV_ITEMS;
  const visibleAdminItems = isAdmin ? ADMIN_NAV_ITEMS : [];

  function renderNavLink(item: NavItem) {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
          active
            ? "bg-blue-500/15 text-white"
            : "text-slate-300 hover:bg-white/5 hover:text-white"
        }`}
      >
        {active && (
          <span
            aria-hidden
            className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-cyan-300"
          />
        )}
        <span
          aria-hidden
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
            active
              ? "bg-cyan-500/20 text-cyan-200"
              : "bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-slate-200"
          }`}
        >
          {item.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{item.label}</span>
          <span
            className={`block truncate text-[10px] font-medium ${
              active ? "text-cyan-100/80" : "text-slate-500 group-hover:text-slate-400"
            }`}
          >
            {item.description}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-slate-900/10 bg-slate-950 px-4 text-white shadow-sm backdrop-blur lg:hidden dark:border-white/10">
        <button
          type="button"
          onClick={() => setMobileOpen((p) => !p)}
          aria-label="메뉴 열기/닫기"
          className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-200 hover:bg-white/10"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
        <span className="text-xs font-bold tracking-[0.08em] text-cyan-200">
          Pipeline Maker
        </span>
        <span className="w-9" aria-hidden />
      </header>

      <aside
        className={`${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-950 text-white shadow-xl ring-1 ring-white/10 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:translate-x-0 lg:shadow-none`}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
            Pipeline Maker
          </p>
          <p className="mt-0.5 text-base font-bold tracking-tight text-white">
            나라장터
          </p>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            공고 탐색 · 영업기회 발굴 ·<br />
            고객사·담당본부 자동 매칭
          </p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {visibleNavItems.map(renderNavLink)}

          {visibleAdminItems.length > 0 && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                관리자
              </p>
              <div className="space-y-1">
                {visibleAdminItems.map(renderNavLink)}
              </div>
            </div>
          )}
        </nav>

        <div className="border-t border-white/10 px-4 py-3 text-[10px] text-slate-400">
          <div
            className="flex items-center gap-2"
            title={`${userEmail} · role=${role}`}
          >
            <span
              aria-hidden
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-[11px] font-bold text-cyan-200 ring-1 ring-inset ring-cyan-400/30"
            >
              {userEmail.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">
              {userEmail}
            </span>
            <span
              className={
                role === "admin"
                  ? "shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200 ring-1 ring-inset ring-amber-400/40"
                  : "shrink-0 rounded-full bg-slate-700/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 ring-1 ring-inset ring-white/10"
              }
            >
              {role}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              void auth.signOut();
              setMobileOpen(false);
            }}
            className="mt-2 inline-flex h-7 w-full items-center justify-center rounded-md bg-white/5 text-[11px] font-semibold text-slate-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/10 hover:text-white"
          >
            로그아웃
          </button>
          <p className="mt-2 text-[10px] text-slate-500">
            내부 사용 · OKESTRO Customer Success
          </p>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        />
      )}

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
