import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Database = {
  public: {
    Tables: {
      notices: {
        Row: NoticeRow;
      };
    };
  };
};

/** Supabase `notices` 테이블 실제 컬럼 */
export type NoticeRow = {
  id: string;
  external_id?: string | null;
  title: string;
  agency: string;
  source: string | null;
  original_url: string | null;
  budget: string | null;
  due_date: string;
  notice_date?: string | null;
  products: string[] | string | null;
  match_score: number | null;
  keywords: string[] | string | null;
  summary: string | null;
  status: string;
  source_type?: string | null;
  raw_data?: Record<string, unknown> | null;
  created_at: string | null;
};

export function getSupabaseConfigError(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return [
      "NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY를 읽지 못했습니다.",
      "`.env.local`에 각 변수를 한 줄씩 넣었는지 확인하고 `npm run dev`를 재시작하세요.",
    ].join(" ");
  }

  return null;
}

/**
 * 브라우저용 Supabase client는 한 번만 생성한다.
 * 모듈 스코프 캐시로 재사용 → "Multiple GoTrueClient instances detected" 경고 방지.
 * url/anonKey가 바뀌었을 때만 재생성하도록 키로 함께 보관한다.
 */
let cachedClient: SupabaseClient<Database> | null = null;
let cachedKey: string | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  const configError = getSupabaseConfigError();
  if (configError) {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  const key = `${url}::${anonKey}`;

  if (cachedClient && cachedKey === key) {
    return cachedClient;
  }

  cachedClient = createClient<Database>(url, anonKey);
  cachedKey = key;
  return cachedClient;
}
