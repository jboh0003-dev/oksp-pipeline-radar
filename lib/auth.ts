"use client";

/**
 * Supabase Auth 세션 + role 헬퍼.
 *
 *  - 모든 화면이 AppShell 의 useAuth() 한 군데에서 세션 + role 을 받아간다.
 *  - 로그인/로그아웃은 lib/supabase.ts 의 캐시된 SupabaseClient 를 그대로 사용 — 단일 GoTrueClient 보장.
 *  - SSR 안전: 서버 렌더 시점에는 status="loading" 이고, 첫 useEffect 에서만 session 을 fetch.
 *  - 환경변수 누락(NEXT_PUBLIC_SUPABASE_*)인 경우 status="missing-config" 로 분기.
 *
 * Role 정책:
 *  - profiles.role 이 "admin" 이면 admin, 그 외 / row 없음 / fetch 실패 → "user" 로 폴백.
 *  - 관리자 권한 강제(서버측 RLS / API guard)는 lib/apiAuth.ts 에서 별도 처리.
 *
 * Auth 에러 회복 정책 (이번 패치):
 *  - getSession() / refreshSession() 가 "Invalid Refresh Token" / "Refresh Token Not Found" /
 *    "Auth session missing" 같은 회복 가능한 에러로 reject 하면, 그걸 그대로 throw 해서
 *    Next.js dev overlay 까지 올리는 게 아니라 — 로컬 세션을 깨끗이 비우고 unauthed 상태로 떨어뜨린다.
 *  - 위 에러들은 "사용자가 다시 로그인하면 끝" 인 정상 회복 시나리오라서 console.warn 만 남긴다.
 *  - 안전망으로 window.unhandledrejection 도 가로채서, 위 패턴은 dev overlay 에 노출되지 않게 한다.
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
 * "회복 가능한 (=stale refresh token / 세션 소실)" 에러 패턴.
 *
 * 이 패턴에 매칭되면:
 *   1) signOut({ scope: 'local' }) 로 메모리 + localStorage 의 토큰 정리.
 *   2) localStorage 에 남은 sb-* / supabase.auth.* 키 강제 삭제 (정리 누락 방어).
 *   3) console.warn 만 남기고 unauthed 로 전환 — 절대 throw 하지 않는다.
 *
 * Supabase-js 가 메시지에 prefix 를 붙이는 케이스도 있어 정규식으로 부분일치.
 */
const AUTH_RECOVERABLE_PATTERNS = [
  /Invalid Refresh Token/i,
  /Refresh Token Not Found/i,
  /Auth ?session missing/i,
];

function isAuthRecoverable(err: unknown): boolean {
  if (!err) return false;
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();
  return AUTH_RECOVERABLE_PATTERNS.some((p) => p.test(msg));
}

/**
 * 메모리 + localStorage 에서 stale 한 Supabase auth 토큰을 모두 비운다.
 *
 *  - signOut({ scope: 'local' }) : 다른 디바이스 세션은 건드리지 않고 이 브라우저만 정리.
 *  - 그 다음 sb-* / supabase.auth.* 키를 직접 삭제 — 일부 환경에서 signOut 만으로
 *    persistSession 키가 남는 케이스 방어.
 *  - 모든 단계는 try/catch 로 감싸서, 정리 실패가 다시 throw 되지 않게 한다.
 */
async function clearStaleAuthTokens(client: SupabaseClient<Database>): Promise<void> {
  try {
    // signOut 자체가 "Auth session missing" 등으로 throw 할 수 있어 catch 필수.
    await client.auth.signOut({ scope: "local" });
  } catch (err) {
    // 이미 세션이 없는 케이스 — 무시.
    if (!isAuthRecoverable(err)) {
      console.warn("[auth] signOut(local) failed during cleanup:", err);
    }
  }

  if (typeof window === "undefined") return;
  try {
    const storage = window.localStorage;
    const toRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      // supabase-js v2: "sb-<projectRef>-auth-token" / legacy: "supabase.auth.token"
      if (
        key.startsWith("sb-") ||
        key.startsWith("supabase.auth.") ||
        key === "supabase.auth.token"
      ) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => {
      try {
        storage.removeItem(k);
      } catch {
        /* per-key 실패는 무시 */
      }
    });
  } catch {
    /* localStorage 자체 접근 실패(예: SSR / private mode) 는 무시 */
  }
}

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
    throw error;
  }
  const row = data as { role: string | null } | null;
  const raw = row?.role ?? null;
  return raw === "admin" ? "admin" : "user";
}

/**
 * 현재 로그인 세션 + role 을 추적하고, 로그인/로그아웃 함수를 함께 반환하는 훅.
 *
 *  - 마운트 시 client.auth.getSession() 1회 + onAuthStateChange 구독.
 *  - getSession() 이 reject 해도 절대 throw 하지 않고 unauthed 로 전환.
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
        role: "user",
        profileStatus: "loading",
      });
      void fetchUserRole(client!, session.user.id)
        .then((role) => {
          if (cancelled) return;
          setState((prev) => {
            if (prev.session?.user.id !== session.user.id) return prev;
            return { ...prev, role, profileStatus: "ready" };
          });
        })
        .catch(() => {
          if (cancelled) return;
          setState((prev) => {
            if (prev.session?.user.id !== session.user.id) return prev;
            return { ...prev, role: "user", profileStatus: "error" };
          });
        });
    }

    /**
     * 초기 세션 로드 — getSession() 의 모든 실패 경로를 봉인한다.
     *
     *  1) 정상 응답: { data, error: null } → handleSession(data.session ?? null)
     *  2) error 필드: { data, error } → recoverable 면 토큰 정리 후 unauthed.
     *  3) Promise reject (AuthApiError 등): 같은 처리 — 절대 위로 throw 하지 않는다.
     *
     * 핵심: 어떤 경로로 들어와도 setState 를 호출해 "loading" 에서 빠져나간다.
     * 안 그러면 사용자는 영원히 스플래시 화면에 갇힌다.
     */
    async function loadInitialSession() {
      try {
        const { data, error } = await client!.auth.getSession();
        if (cancelled) return;
        if (error) {
          if (isAuthRecoverable(error)) {
            console.warn(
              "[auth] stale session detected — clearing local tokens:",
              error.message,
            );
            await clearStaleAuthTokens(client!);
          } else {
            console.warn("[auth] getSession returned error:", error.message);
          }
          handleSession(null);
          return;
        }
        handleSession(data.session ?? null);
      } catch (err) {
        if (cancelled) return;
        if (isAuthRecoverable(err)) {
          console.warn(
            "[auth] stale refresh token thrown — clearing local tokens:",
            err instanceof Error ? err.message : err,
          );
          await clearStaleAuthTokens(client!);
        } else {
          console.warn("[auth] unexpected getSession exception:", err);
        }
        handleSession(null);
      }
    }
    void loadInitialSession();

    /**
     * 안전망 — 어떤 경로로든 supabase 내부 promise 가 reject 되어
     * dev overlay 까지 올라가는 걸 막는다.
     *
     *  - "Invalid Refresh Token" / "Refresh Token Not Found" / "Auth session missing"
     *    패턴은 dev overlay 노출 차단 (preventDefault + console.warn).
     *  - 그 외 reject 는 그대로 두어 디버깅 가능하게 유지.
     */
    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      if (isAuthRecoverable(event.reason)) {
        console.warn(
          "[auth] swallowed Auth refresh rejection:",
          event.reason instanceof Error ? event.reason.message : event.reason,
        );
        event.preventDefault();
        // 비동기 정리 — fire-and-forget. 다음 getSession 호출에서 깨끗한 상태가 되도록.
        void clearStaleAuthTokens(client!);
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("unhandledrejection", handleUnhandledRejection);
    }

    /**
     * onAuthStateChange — supabase-js 의 토큰 갱신 / 로그인 / 로그아웃 이벤트.
     *
     *  - "TOKEN_REFRESHED" 인데 session 이 null 이면 = refresh 실패 → 토큰 정리.
     *  - 그 외(SIGNED_IN / SIGNED_OUT / USER_UPDATED 등) 는 그대로 session 으로 전환.
     */
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && !session) {
        console.warn("[auth] TOKEN_REFRESHED with null session — clearing tokens");
        void clearStaleAuthTokens(client);
        handleSession(null);
        return;
      }
      handleSession(session ?? null);
    });

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      }
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
      try {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          return { ok: false, error: error.message };
        }
        return { ok: true };
      } catch (err) {
        // signInWithPassword 가 throw 하는 케이스(네트워크 등) — UI 에 메시지로만 노출.
        const msg = err instanceof Error ? err.message : "로그인 중 오류가 발생했습니다.";
        return { ok: false, error: msg };
      }
    },
    async signOut() {
      const client = getSupabaseClient();
      if (!client) return;
      // signOut 도 "Auth session missing" 으로 throw 할 수 있어 안전 처리.
      try {
        await client.auth.signOut();
      } catch (err) {
        if (!isAuthRecoverable(err)) {
          console.warn("[auth] signOut error:", err);
        }
        // 어쨌든 localStorage 는 비워서 다음 진입에 stale 토큰이 안 남게.
        await clearStaleAuthTokens(client);
      }
    },
  };
}
