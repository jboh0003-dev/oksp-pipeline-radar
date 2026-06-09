/**
 * 앱 전역에서 쓰는 브랜딩/도메인 상수.
 *
 * 도메인은 코드에 하드코딩하지 않고 `NEXT_PUBLIC_APP_URL` 환경변수로 받는다.
 * 비워두면 csg2b 기본값을 사용한다 (개발 편의 + 미설정 환경 대응).
 *
 * Vercel 배포 시 주의:
 *  - 이 파일을 바꿔도 실제 운영 도메인이 자동으로 바뀌지는 않는다.
 *  - Vercel 대시보드 → Project → Settings → Domains 에서 원하는 도메인을 추가하고
 *    회사 DNS 에 CNAME / A 레코드를 등록해야 한다. (예: csg2b.okestro.com → cname.vercel-dns.com)
 *  - 그 후에 환경변수 NEXT_PUBLIC_APP_URL 을 같은 값으로 맞춰주면 된다.
 */

export const APP_NAME = "CS-G2B";
export const APP_FULL_NAME = "OKESTRO CS-G2B";
export const APP_TITLE = "나라장터 공고 대시보드";
export const APP_DESCRIPTION =
  "공공기관 조달 공고 조회 · 고객사·담당본부 기준 자동 매칭";

const DEFAULT_APP_URL = "https://csg2b.okestro.com";

/** 환경변수에 설정된 운영 도메인. 미설정이면 기본값 사용. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL;
