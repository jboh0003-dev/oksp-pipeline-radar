"use client";

/**
 * Supabase Auth 세션 + role 헬퍼.
 *
 *  - 모든 화면이 AppShell 의 useAuth() 한 군데에서 세션 + role 을 받아간다.
 *  - 로그인/로그아웃은 lib/supabase.ts 의 캐시된 SupabaseClient 를 그대로 사용 — 단일 GoTrueClient 보장.
 *  - SSR 안전: 서버 렌더 시점에는 status="loading" 이고, 첫 useEffect 에서만 session 을 fetch.
 *  - 환경변수 누락(NEXT_PUBLIC_SUPABASE_*)인 경우 status="missing-config" 로 분기.
 *
 * Role 정책 (이번 phase 추가):
 *  - profiles.role 이 "admin" 이면 admin, 그 외 / row 없음 / fetch 실패 → "user" 로 폴백.
 *  - role 은 화면 메뉴 노출 제어 용도. 수집 로직 / DB 동작 자체에는 영향 없음.
 *  - 관리자 권한 강제(서버측 RLS / API guard)는 다음 phase.
 */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import {
  getSupabaseClient,
  getSupabaseConfigError,
  type Database,
} from "@/lib/supabase";

export type AuthStatus = "loading" | "authed" | "unauthed" | "missing-config";

export type UserRole = "admin" | "user";

export type AuthState = {
  status: AuthStatus;
  session: Session | null;
  /** Supabase 환경변수가 빠진 경우 사용자에게 보여줄 안내 메시지. */
  configError: string | null;
  /**
   * 현재 사용자 role. profiles row 가 없거나 fetch 실패 시 "user".
   * 로그인 직후 profile fetch 가 끝나기 전엔 항상 "user" 로 보수적으로 시작 →
   * profile fetch 가 끝나면 admin 으로 격상될 수 있다.
   */
  role: UserRole;
  /** profile row fetch 진행 상태 — UI 가 "역할 확인 중…" 같은 미세 표시에 활용 가능. */
  profileStatus: "idle" | "loading" | "ready" | "error";
};

export type AuthHookValue = AuthState & {
  isAdmin: boolean;
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

const INITIAL_STATE: AuthState = {
  status: "loading",
  session: null,
  configError: null,
  role: "user",
  profileStatus: "idle",
};

/**
 * profiles 테이블에서 사용자 role 을 조회해 'admin' | 'user' 로 정규화.
 *
 *  - row 가 없거나 role 이 "admin" 이외 값이면 "user" 로 폴백.
 *  - 네트워크 / RLS 오류 등은 호출부가 profileStatus="error" 로 감지할 수 있도록 throw.
 */
async function fetchUserRole(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<UserRole> {
  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // row 가 0개일 때 PGRST116 — maybeSingle() 이 에러 대신 null 을 줘서 여기 안 옴.
    // 그 외(권한 / 네트워크) 는 fall-through 시 "user" 로 폴백되도록 throw.
    throw error;
  }
  // Database 타입이 Row 만 선언해 select 결과 추론이 좁아지는 케이스 대비 — 명시적 캐스트.
  const row = data as { role: string | null } | null;
  const raw = row?.role ?? null;
  return raw === "admin" ? "admin" : "user";
}

/**
 * 현재 로그인 세션 + role 을 추적하고, 로그인/로그아웃 함수를 함께 반환하는 훅.
 *
 *  - 마운트 시 client.auth.getSession() 1회 + onAuthStateChange 구독.
 *  - 세션이 잡히면 profiles 테이블에서 role 을 비동기 fetch → 끝나면 role 갱신.
 *  - 세션이 사라지면 role 은 "user" 로 리셋.
 */
export function useAuth(): AuthHookValue {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  useEffect(() => {
    const configError = getSupabaseConfigError();
    if (configError) {
      setState({
        ...INITIAL_STATE,
        status: "missing-config",
        configError,
        profileStatus: "idle",
      });
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setState({
        ...INITIAL_STATE,
        status: "missing-config",
        configError: "Supabase 클라이언트를 만들 수 없습니다.",
      });
      return;
    }

    let cancelled = false;

    /**
     * 세션이 들어왔을 때 호출되는 통합 핸들러.
     *  - session=null   : unauthed 상태로 리셋 (role 도 user).
     *  - session 있음   : status=authed + role=user 로 우선 표시한 뒤,
     *                     profiles 에서 role 을 받아오면 그때 admin 으로 격상.
     */
    function handleSession(session: Session | null) {
      if (cancelled) return;
      if (!session) {
        setState({
          status: "unauthed",
          session: null,
          configError: null,
          role: "user",
          profileStatus: "idle",
        });
        return;
      }
      setState({
        status: "authed",
        session,
        configError: null,
        role: "user", // 폴백 (admin 격상은 fetch 완료 후)
        profileStatus: "loading",
      });
      void fetchUserRole(client!, session.user.id)
        .then((role) => {
          if (cancelled) return;
          setState((prev) => {
            // 그 사이에 로그아웃 / 사용자 변경됐다면 무시.
            if (prev.session?.user.id !== session.user.id) return prev;
            return { ...prev, role, profileStatus: "ready" };
          });
        })
        .catch(() => {
          if (cancelled) return;
          setState((prev) => {
            if (prev.session?.user.id !== session.user.id) return prev;
            // 네트워크 / RLS 차단 등 — role 은 user 로 폴백 유지, status 만 error.
            return { ...prev, role: "user", profileStatus: "error" };
          });
        });
    }

    void client.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        handleSession(null);
        return;
      }
      handleSession(data.session ?? null);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      handleSession(session ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    ...state,
    isAdmin: state.role === "admin",
    async signInWithPassword(email, password) {
      const client = getSupabaseClient();
      if (!client) {
        return { ok: false, error: "Supabase 환경변수가 없어 로그인할 수 없습니다." };
      }
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true };
    },
    async signOut() {
      const client = getSupabaseClient();
      if (!client) return;
      await client.auth.signOut();
    },
  };
}
