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
  title: string;
  agency: string;
  source: string | null;
  original_url: string | null;
  budget: string | null;
  due_date: string;
  products: string[] | string | null;
  match_score: number | null;
  keywords: string[] | string | null;
  summary: string | null;
  status: string;
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

export function getSupabaseClient(): SupabaseClient<Database> | null {
  const configError = getSupabaseConfigError();
  if (configError) {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  return createClient<Database>(url, anonKey);
}
