"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "oksp-theme";

type Theme = "light" | "dark";

/**
 * Header 우측에 배치되는 라이트/다크 모드 토글.
 *
 * - 기본값은 "light".
 * - 사용자가 토글하면 그 값이 localStorage(`oksp-theme`)에 저장되고
 *   다음 접속 때도 동일하게 적용된다.
 * - 깜빡임/hydration 미스매치 방지를 위해
 *   layout.tsx 의 inline script 가 페이지 첫 렌더 전에 `<html class="dark">` 를 붙인다.
 *   이 컴포넌트는 mount 후에만 실제 아이콘을 보여 hydration mismatch 를 피한다.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let initial: Theme = "light";
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "dark") initial = "dark";
      else if (stored === "light") initial = "light";
      else if (document.documentElement.classList.contains("dark")) {
        // inline script 가 이미 dark 를 적용한 경우(prefers-color-scheme 등) 동기화
        initial = "dark";
      }
    } catch {
      // localStorage 접근 불가(예: 시크릿 모드) — 기본값 유지
    }
    setTheme(initial);
    setMounted(true);
  }, []);

  function applyTheme(next: Theme) {
    const root = document.documentElement;
    if (next === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setTheme(next);
  }

  // 첫 렌더에서는 자리만 잡고 아이콘 종류는 보여주지 않아 SSR/CSR 간 불일치를 방지.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="테마 전환"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white/70 dark:border-white/10 dark:bg-slate-800/40"
      />
    );
  }

  const isDark = theme === "dark";
  const nextTheme: Theme = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => applyTheme(nextTheme)}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-blue-400/40 dark:hover:bg-slate-800 dark:hover:text-blue-300"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
