/**
 * Supabase 연결 환경 진단 — 로컬/운영 DB 혼동 방지용.
 * 브라우저(anon URL)와 서버(service URL) 모두에서 project ref 를 마스킹해 로그에 남긴다.
 */

export function parseSupabaseUrl(url: string | undefined | null): {
  projectRef: string | null;
  maskedUrl: string | null;
} {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { projectRef: null, maskedUrl: null };
  }
  try {
    const u = new URL(url);
    const refMatch = u.host.match(/^([a-z0-9]+)\.supabase\.(co|in|net)$/i);
    if (!refMatch) {
      return { projectRef: null, maskedUrl: `${u.protocol}//****` };
    }
    const ref = refMatch[1];
    const masked =
      ref.length > 8
        ? `${ref.slice(0, 4)}****${ref.slice(-4)}`
        : `${ref.slice(0, 2)}****`;
    return {
      projectRef: ref,
      maskedUrl: `${u.protocol}//${masked}.supabase.${refMatch[2]}`,
    };
  } catch {
    return { projectRef: null, maskedUrl: null };
  }
}

/** 클라이언트 번들에서 사용 (NEXT_PUBLIC_* 만 접근 가능). */
export function getClientSupabaseDebugInfo(): {
  nodeEnv: string;
  supabaseUrl: string | null;
  projectRef: string | null;
  maskedUrl: string | null;
  hasAnonKey: boolean;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const parsed = parseSupabaseUrl(url);
  return {
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    supabaseUrl: url,
    projectRef: parsed.projectRef,
    maskedUrl: parsed.maskedUrl,
    hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

/** 서버 API / cron 에서 사용. */
export function getServerSupabaseDebugInfo(): {
  nodeEnv: string;
  publicUrl: ReturnType<typeof parseSupabaseUrl> & { raw: string | null };
  serviceUrl: ReturnType<typeof parseSupabaseUrl> & { raw: string | null };
  hasServiceRoleKey: boolean;
} {
  const publicRaw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const serviceRaw =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  return {
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    publicUrl: { ...parseSupabaseUrl(publicRaw), raw: publicRaw },
    serviceUrl: { ...parseSupabaseUrl(serviceRaw), raw: serviceRaw },
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
