"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * 사이드바 네비게이션 — CS-G2B 의 모든 화면이 공통으로 갖는 좌측 메뉴.
 *
 * 메뉴:
 *  - 입찰공고     (/)            : 기존 나라장터 입찰공고 대시보드
 *  - 사전규격공고 (/pre-spec)    : 사전규격 단계의 공고 (조달청 사전규격정보서비스)
 *  - 피드백       (/feedback)    : 영업이 남긴 피드백 모아보기
 *
 * 데스크톱(lg+): 사이드바 고정(240px), 본문은 우측에 grid 로 배치.
 * 모바일(<lg)  : 햄버거 토글 → fixed overlay 형태로 슬라이드.
 *
 * 디자인 톤:
 *  - 다크 navy 패널 (입찰 대시보드 헤더 톤과 통일).
 *  - 활성 메뉴: 좌측 4px cyan 강조선 + 살짝 밝은 배경.
 *  - 상단에는 OKESTRO 로고 + CS-G2B 브랜드 워드마크.
 */

type NavItem = {
  href: string;
  label: string;
  description: string;
  /** 아이콘 (간단한 SVG) */
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "입찰공고",
    description: "나라장터 입찰공고",
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
    href: "/feedback",
    label: "피드백 현황",
    description: "영업 의견 모아보기",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  /**
   * 활성 메뉴 판단:
   *  - 정확히 매칭되거나
   *  - 메뉴가 "/" 가 아닌 경우, 현재 경로가 그 메뉴 경로로 시작하면 활성.
   */
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* 모바일 상단 스트립 — 사이드바 토글 + 브랜드 */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-slate-900/10 bg-slate-950 px-4 text-white shadow-sm backdrop-blur lg:hidden dark:border-white/10">
        <button
          type="button"
          onClick={() => setMobileOpen((p) => !p)}
          aria-label="메뉴 열기/닫기"
          className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-200 hover:bg-white/10"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">
          CS-G2B
        </span>
        <span className="w-9" aria-hidden />
      </header>

      {/* 사이드바 */}
      <aside
        className={`${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-950 text-white shadow-xl ring-1 ring-white/10 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:translate-x-0 lg:shadow-none`}
      >
        {/* 브랜드 영역 */}
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
            OKESTRO CS-G2B
          </p>
          <p className="mt-0.5 text-base font-bold tracking-tight text-white">
            나라장터 공고 조회
          </p>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            공공기관 조달 공고 조회 ·<br />
            사전규격 조기탐지 · 담당본부 자동 매칭
          </p>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
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
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-3 text-[10px] text-slate-500">
          내부 사용 · OKESTRO Customer Success
        </div>
      </aside>

      {/* 모바일에서 사이드바 열렸을 때 backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* 본문 */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
