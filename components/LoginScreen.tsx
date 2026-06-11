"use client";

import { useState } from "react";
import OkestroWordmark from "@/components/OkestroWordmark";

/**
 * Supabase Auth 이메일/비밀번호 로그인 화면.
 *
 *  - 이번 phase: 이메일/비밀번호로만 로그인. SSO / OAuth / 회원가입 / 비밀번호 재설정은 다음 단계.
 *  - 환경변수가 빠져 있으면 configError 메시지를 그대로 안내 — 로그인 시도는 막는다.
 *  - 디자인 톤은 입찰공고 헤더와 동일한 dark-navy + cyan 액센트로 통일 (csg2b-header-bg 사용 X —
 *    로그인 화면은 별도 카드 형태). 헤더 / 사이드바 디자인은 일절 손대지 않는다.
 */

type Props = {
  /**
   * Supabase 환경변수가 빠진 경우 안내 메시지. null 이면 정상적으로 로그인 폼을 보여준다.
   */
  configError: string | null;
  /**
   * AppShell.useAuth().signInWithPassword 와 동일한 시그니처.
   * 성공 시 onAuthStateChange 가 위에서 세션을 갱신해 LoginScreen 이 자동으로 사라진다.
   */
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>;
};

export default function LoginScreen({ configError, signInWithPassword }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const disabled = submitting || Boolean(configError);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const result = await signInWithPassword(email, password);
      if (!result.ok) {
        setErrorMessage(result.error ?? "로그인에 실패했습니다.");
      }
      // 성공 시 onAuthStateChange 가 화면을 자동 전환.
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center">
        {/* 브랜드 */}
        <div className="mb-6 flex items-center gap-3">
          <OkestroWordmark />
          <div className="hidden h-9 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent sm:block" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90">
              OKESTRO CS-G2B
            </p>
            <p className="mt-0.5 text-base font-bold tracking-tight text-white">
              나라장터 공고 대시보드
            </p>
          </div>
        </div>

        {/* 카드 */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-xl backdrop-blur-sm sm:p-7">
          <h1 className="text-lg font-bold text-white">로그인</h1>
          <p className="mt-1 text-xs text-slate-400">
            등록된 사내 이메일과 비밀번호로 접속하세요.
          </p>

          {configError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-amber-200"
            >
              <p className="font-semibold">환경 구성 안내</p>
              <p className="mt-1 break-words">{configError}</p>
              <p className="mt-1 text-amber-200/80">
                관리자에게 <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> /{" "}
                <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> 설정을
                요청해주세요.
              </p>
            </div>
          )}

          <form className="mt-5 space-y-3" onSubmit={handleSubmit} noValidate>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                이메일
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={disabled}
                placeholder="name@okestro.com"
                className="block h-10 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                비밀번호
              </span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={disabled}
                placeholder="비밀번호"
                className="block h-10 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 disabled:opacity-60"
              />
            </label>

            {errorMessage && (
              <p
                role="alert"
                className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200"
              >
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={disabled || !email || !password}
              className={`mt-1 inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold transition ${
                disabled || !email || !password
                  ? "cursor-not-allowed bg-blue-500/40 text-white/70"
                  : "bg-blue-600 text-white hover:bg-blue-500"
              }`}
            >
              {submitting ? "로그인 중…" : "로그인"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-500">
          내부 사용 · OKESTRO Customer Success
        </p>
      </div>
    </div>
  );
}
