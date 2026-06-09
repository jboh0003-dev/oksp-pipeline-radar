# CS-G2B · 나라장터 공고 대시보드

`OKESTRO CS-G2B` — 공공기관 조달 공고를 제품·고객사·담당본부 기준으로 자동 매칭하는 사내 대시보드.

- 운영 도메인 (예정): `csg2b.okestro.com` (`NEXT_PUBLIC_APP_URL` 환경변수로 관리)
- 데이터 소스: 나라장터(G2B) Open API + Supabase
- 자동 수집: Vercel Cron (KST 08:30, 14:00) + 화면의 "지금 수집" 버튼
- 첫 진입 가속: 마지막 수집 결과를 localStorage 에 캐시(15분 TTL)해 즉시 렌더 후 백그라운드 새로고침

## 환경 변수

`.env.local` 또는 Vercel Project Settings → Environment Variables 에 등록.

| 키 | 설명 | 예시 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | (서버 전용) service role key | `eyJhbGciOi...` |
| `G2B_SERVICE_KEY` | 나라장터 OpenAPI 인증키 | `xxx==` |
| `CRON_SECRET` | Vercel Cron 호출 보호용 secret | 임의 랜덤 문자열 |
| `NEXT_PUBLIC_APP_URL` | 표시·canonical URL | `https://csg2b.okestro.com` |

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
