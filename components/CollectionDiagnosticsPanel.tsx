"use client";

import type { CollectionRunRow } from "@/lib/supabase";

type Props = {
  lastAttempt: CollectionRunRow | null;
  lastSuccess: CollectionRunRow | null;
  fetchError: string | null;
};

/**
 * 운영/수집 진단은 Vercel Runtime Logs와 Supabase collection_runs에서 확인한다.
 * 사용자 화면에서는 기술 진단 패널을 노출하지 않는다.
 */
export default function CollectionDiagnosticsPanel(props: Props) {
  void props;
  return null;
}
