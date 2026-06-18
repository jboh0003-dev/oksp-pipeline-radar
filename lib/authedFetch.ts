"use client";

/**
 * 관리자 전용 API 호출용 fetch wrapper.
 *
 *  - Supabase 세션의 access_token 을 Authorization: Bearer 헤더로 자동 부착.
 *  - 토큰이 없으면 헤더 없이 호출 (서버는 401 로 거부).
 *
 * 사용처: /api/collect-now, /api/sync-g2b, /api/test-g2b, /api/search-g2b-keyword 등
 *         lib/apiAuth.ts 의 requireAdmin 으로 보호되는 라우트.
 */

import { getSupabaseClient } from "@/lib/supabase";

export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token && !headers.has("authorization") && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // 세션 조회 실패는 그대로 진행 — 서버에서 401 처리.
    }
  }
  return fetch(input, { ...init, headers });
}
