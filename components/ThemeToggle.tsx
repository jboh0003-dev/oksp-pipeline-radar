"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "cs-g2b-theme";
const LEGACY_STORAGE_KEY = "oksp-theme";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let initial: Theme = "light";
    try {
      let stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy === "dark" || legacy === "light") {
          stored = legacy;
          window.localStorage.setItem(STORAGE_KEY, legacy);
        }
      }
      if (stored === "dark") initial = "dark";
      else if (stored === "light") initial = "light";
      else if (document.documentElement.classList.contains("dark")) initial = "dark";
    } catch {
      // localStorage 접근 불가 시 현재 DOM 테마를 사용한다.
      if (document.documentElement.classList.contains("dark")) initial = "dark";
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
      // 저장이 불가능해도 현재 세션의 테마 전환은 유지한다.
    }
    setTheme(next);
  }

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="테마 전환"
        className="inline-flex h-9 min-w-[92px] items-center justify-center rounded-lg border border-slate-200 bg-white/90 px-3 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-200"
      >
        테마
      </button>
    );
  }

  const isDark = theme === "dark";
  const nextTheme: Theme = isDark ? "light" : "dark";
  const label = isDark ? "일반모드" : "다크모드";

  return (
    <button
      type="button"
      onClick={() => applyTheme(nextTheme)}
      aria-label={`${label}로 전환`}
      title={`${label}로 전환`}
      className="inline-flex h-9 min-w-[92px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-slate-800/95 dark:text-slate-100 dark:hover:border-blue-400/40 dark:hover:bg-slate-800 dark:hover:text-blue-300"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      <span>{label}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
