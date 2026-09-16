"use client";

import type { CollectionError } from "@/lib/collectionErrors";

type Props = {
  errors: CollectionError[];
  title?: string;
};

/**
 * 기술적인 수집 오류 상세는 운영 로그에서 확인한다.
 * 사용자 화면에서는 실패 원문/엔드포인트/페이지 정보를 노출하지 않는다.
 */
export default function CollectionErrorPanel(props: Props) {
  void props;
  return null;
}
