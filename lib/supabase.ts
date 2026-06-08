import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Database = {
  public: {
    Tables: {
      notices: {
        Row: NoticeRow;
      };
      collection_runs: {
        Row: CollectionRunRow;
      };
      customer_accounts: {
        Row: CustomerAccountRow;
      };
    };
  };
};

/**
 * Supabase `customer_accounts` 테이블 row.
 * 내부 고객사 마스터. 공고 기관명과 매칭해 담당본부 / Named / 지역 정보를 화면에 표시한다.
 */
export type CustomerAccountRow = {
  id: string;
  customer_name: string;
  customer_name_norm: string;
  customer_group: string | null;
  account_type: string | null;
  territory: string | null;
  region_group: string | null;
  region: string | null;
  address: string | null;
  business_number: string | null;
  source_file: string | null;
  updated_at: string | null;
};

/**
 * Supabase `collection_runs` 테이블 row.
 * 자동수집(cron) 또는 수동 수집 실행 이력. 화면에서는 가장 최근 1건만 읽는다.
 */
export type CollectionRunRow = {
  id: string;
  source: string | null;
  /** 실행 방식. 'auto' = cron 자동수집, 'manual' = 화면 버튼(지금 수집). 마이그 전 환경 대비 optional. */
  mode?: "auto" | "manual" | string | null;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  target_count: number | null;
  page_start: number | null;
  page_end: number | null;
  fetched_count: number | null;
  matched_count: number | null;
  saved_count: number | null;
  /** 신규 저장 건수. saved_count 의 분해값. 마이그 전 환경 대비 optional. */
  inserted_count?: number | null;
  /** 기존 공고 업데이트 건수. saved_count 의 분해값. 마이그 전 환경 대비 optional. */
  updated_count?: number | null;
  skipped_expired_count: number | null;
  skipped_no_product_count: number | null;
  errors: string[] | null;
  // warnings / message 는 후속 마이그레이션으로 추가된 컬럼.
  // 아직 alter 가 적용되지 않은 환경에서도 UI 가 깨지지 않도록 optional 로 둔다.
  warnings?: string[] | null;
  message?: string | null;
  created_at: string | null;
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
