# CS-G2B · 나라장터 공고 대시보드

`OKESTRO CS-G2B` — 공공기관 조달 공고를 제품·고객사·담당본부 기준으로 자동 매칭하는 사내 대시보드.

- 운영 도메인 (예정): `csg2b.okestro.com` (`NEXT_PUBLIC_APP_URL` 환경변수로 관리)
- 데이터 소스: 나라장터(G2B) Open API + Supabase
- 자동 수집: Vercel Cron 매일 KST 08:30 (= UTC 23:30, `30 23 * * *`) — **입찰공고 + 사전규격공고 동시 수집**
- 수동 수집: 화면의 "지금 수집" 버튼 (admin role 사용자만 노출 / API 단에서도 admin role 검증)
- 첫 진입 가속: 마지막 수집 결과를 localStorage 에 캐시(15분 TTL)해 즉시 렌더 후 백그라운드 새로고침
- 권한 모델: profiles.role 기반 RBAC (admin / user). 관리자 메뉴 + 관리자 API 모두 admin 만 접근 가능.

## 환경 변수

`.env.local` 또는 Vercel Project Settings → Environment Variables 에 등록.

| 키 | 설명 | 예시 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | (서버 전용) service role key | `eyJhbGciOi...` |
| `G2B_SERVICE_KEY` | 입찰공고 (BidPublicInfoService) 인증키 — Decoding 인증키 권장 | `xxx==` |
| `NARA_PRESPEC_API_KEY` *(권장)* | 사전규격공고 (HrcspSsstndrdInfoService) 전용 인증키 — Decoding 인증키 권장 | `yyy==` |
| `NARA_API_KEY` *(대체)* | 한 키로 입찰/사전규격 모두 신청한 경우 사용 — Decoding 인증키 | `yyy==` |
| `G2B_PRESPEC_SERVICE_KEY` *(legacy)* | 기존 배포 호환용. 신규 배포는 `NARA_PRESPEC_API_KEY` 권장 | `yyy==` |
| `CRON_SECRET` | Vercel Cron 호출 보호용 secret (`/api/cron/*` 라우트 인증) | 임의 랜덤 문자열 |
| `NEXT_PUBLIC_APP_URL` | 표시·canonical URL | `https://csg2b.okestro.com` |

### 사전규격 ServiceKey 분리 안내

공공데이터포털은 **입찰공고**(`BidPublicInfoService`, 경로 `/1230000/ad/...`)와 **사전규격공고**
(`HrcspSsstndrdInfoService`, 경로 `/1230000/ao/...`)를 *별개의 서비스*로 신청한다. 활용신청 시
서비스마다 ServiceKey 가 따로 발급되는 경우가 있고, 두 키가 혼동되면 "입찰공고는 되는데
사전규격만 안 된다" 증상이 그대로 나타난다.

이 프로젝트의 사전규격 수집은 다음 우선순위로 ServiceKey 를 읽는다:

1. `NARA_PRESPEC_API_KEY` *(권장 — 사전규격 전용 키)*
2. `NARA_API_KEY` *(한 키로 입찰/사전규격 양쪽 모두 신청한 경우 단일 변수로 끝)*
3. `G2B_PRESPEC_SERVICE_KEY` *(legacy 호환 — 기존 배포)*
4. `G2B_SERVICE_KEY` *(입찰공고용 키. 한 키로 양쪽 모두 신청한 경우만 동작)*

위 네 변수 중 하나만 있어도 사전규격 수집은 동작한다. 모두 비어 있으면
`/api/pre-spec/collect` 와 cron 모두 다음 메시지로 명확히 실패한다:
"사전규격 ServiceKey 가 설정되지 않았습니다."

운영 환경(Vercel Production / Preview)과 로컬(`.env.local`) 모두에 위 환경변수를 동일하게
등록해야 한다. 로그/응답 어디에도 ServiceKey 원문은 출력되지 않으며, 진단용으로는 마스킹된
형태(앞 4자 + `…` + 뒤 4자) 만 노출된다.

### 사전규격 API 진단 — `/api/debug-prespec`

수집이 0건이거나 인증 오류가 의심될 때 즉시 원인을 확인할 수 있는 진단 라우트.
**로그인 / requireAdmin / CRON_SECRET 모두 적용하지 않는다** — 누구나 브라우저로 바로
사전규격 API 의 원본 응답을 확인할 수 있도록 의도적으로 인증 게이트를 두지 않았다.
보안 측면에서는 ServiceKey 원문 노출을 막기 위해 응답에서 마스킹된 형태만 반환한다.

응답에 포함되는 항목:
- `endpoint`, `baseUrl`, `url`(serviceKey 마스킹), `inqryBgnDt`/`inqryEndDt`
- `serviceKey.{present, source, length, masked, looksEncoded}` — *원문 미포함*
- `httpStatus`, `resultCode`, `resultMsg` — 인증/파라미터/엔드포인트 오류 구분
- `totalCount`, `pageNo`, `numOfRows`, `itemsCount`
- `itemsSample` — 응답 첫 3건 (사전규격등록번호 / 품명 / 배정예산 / 규격서 파일 필드 검증용)
- `firstItemKeys` — 첫 item 의 30개 key 목록
- `rawBodyFirst1000` — 원본 response body 첫 1000자 (XML 응답도 그대로 보임)
- `diagnosis` — `OK` / `EMPTY_ITEMS` / `API_KEY_MISSING` / `API_RESPONSE_ERROR` / ...
- `hint` — 0건이거나 에러일 때 다음 행동 안내 한 줄

호출 예:

```
# 기본 (servc, 7일, numOfRows=20, pageNo=1)
curl http://localhost:3000/api/debug-prespec

# 물품 30일치 100건
curl 'http://localhost:3000/api/debug-prespec?endpoint=getPublicPrcureThngInfoThngPPSSrch&days=30&numOfRows=100'

# 운영
curl https://csg2b.okestro.com/api/debug-prespec
```

선택 query 파라미터:
- `endpoint` — 기본 `getPublicPrcureThngInfoServcPPSSrch`. 허용값은 4개 운영 endpoint 와 legacy.
- `days` — 1..90, 기본 7
- `inqryBgnDt`, `inqryEndDt` — 둘 다 12자리(`yyyymmddHHMM`) 면 `days` 대신 사용
- `numOfRows` — 1..100, 기본 20

## Vercel 도메인 연결

코드만으로는 도메인이 바뀌지 않는다. 운영 도메인을 `csg2b.okestro.com` 로 두려면:

1. Vercel 대시보드 → Project → Settings → **Domains** 에 `csg2b.okestro.com` 추가
2. 회사 DNS 에 CNAME 레코드 등록: `csg2b.okestro.com → cname.vercel-dns.com`
3. Vercel 환경변수 `NEXT_PUBLIC_APP_URL` 을 같은 값으로 설정 후 재배포

## 브랜드 자산 (선택)

다음 두 파일이 있으면 자동으로 사용된다 (없으면 텍스트/그라데이션 fallback):

- `public/assets/okestro-logo.png` — 헤더 좌측 OKESTRO 로고 (배경 투명 권장)
- `public/assets/okestro-building.jpg` — 헤더 hero 영역 배경 (회사 건물 사진 등)

호환을 위해 구 경로(`public/okestro-logo.svg`, `public/header-bg.jpg`)도 fallback 으로 시도한다.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
