// 사전규격 상세 URL 해석 검증 스크립트.
//
// 실행:
//   npx tsx scripts/verify-prespec-detail-url.mjs
//
// 목적:
//   1) resolvePreSpecDetailUrl 가 사용자 샘플 R26BD00238283 에 대해
//      *반드시* method='search-fallback' / verified=false / detailUrl=null 을 반환해야 한다.
//      (= 검색/목록 URL 을 detail URL 로 둔갑시키지 않는다는 회귀 보장)
//   2) API 가 검증된 detailUrl 을 직접 줄 때만 method='verified-detail' / verified=true 가 된다.
//   3) 등록번호도 없을 때 method='unsupported' / detailUrl=null 이 된다.
//
// 이 스크립트는 dev 의존성이 없는 순수 Node 환경에서 동작한다 (TS 모듈은 tsx 가 처리).

import { resolvePreSpecDetailUrl } from "../lib/preSpec/detailUrl.js";

let pass = 0;
let fail = 0;

function check(label, expected, actual) {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}`);
    console.log(`    expected: ${JSON.stringify(expected)}`);
    console.log(`    actual  : ${JSON.stringify(actual)}`);
  }
}

console.log("[1] 사용자 샘플 R26BD00238283 — 검색/목록 URL 을 detail URL 로 둔갑시키면 안 됨");
{
  const r = resolvePreSpecDetailUrl({ preSpecRegNo: "R26BD00238283" });
  check("detailUrl === null", null, r.detailUrl);
  check("verified === false", false, r.verified);
  check("method === 'search-fallback'", "search-fallback", r.method);
  if (typeof r.searchUrl !== "string" || !r.searchUrl.startsWith("https://www.g2b.go.kr/link/")) {
    fail += 1;
    console.log(`  ✗ searchUrl 형식 불일치: ${r.searchUrl}`);
  } else {
    pass += 1;
    console.log(`  ✓ searchUrl 형식 OK: ${r.searchUrl}`);
  }
  if (!r.searchUrl.includes("R26BD00238283")) {
    fail += 1;
    console.log(`  ✗ searchUrl 에 등록번호가 포함되지 않음`);
  } else {
    pass += 1;
    console.log(`  ✓ searchUrl 에 등록번호 포함됨`);
  }
}

console.log("\n[2] API 가 직접 https detailUrl 을 줄 때만 verified-detail");
{
  const r = resolvePreSpecDetailUrl({
    apiDetailUrl: "https://example.gov.kr/some/verified/detail.do?id=123",
    preSpecRegNo: "R26BD00238283",
  });
  check("detailUrl 채워짐", "https://example.gov.kr/some/verified/detail.do?id=123", r.detailUrl);
  check("verified === true", true, r.verified);
  check("method === 'verified-detail'", "verified-detail", r.method);
}

console.log("\n[3] 비-http URL 은 verified 로 인정되지 않아야 함");
{
  const r = resolvePreSpecDetailUrl({
    apiDetailUrl: "javascript:void(0)",
    preSpecRegNo: "R26BD00238283",
  });
  check("detailUrl === null (javascript: 거부)", null, r.detailUrl);
  check("verified === false", false, r.verified);
}

console.log("\n[4] 등록번호도 없을 때 unsupported");
{
  const r = resolvePreSpecDetailUrl({});
  check("detailUrl === null", null, r.detailUrl);
  check("verified === false", false, r.verified);
  check("method === 'unsupported'", "unsupported", r.method);
}

console.log("\n[5] 등록번호 query 에 한글 / 특수문자가 들어와도 안전 인코딩");
{
  const r = resolvePreSpecDetailUrl({ preSpecRegNo: "테스트 #99" });
  if (!r.searchUrl.includes("%ED%85%8C%EC%8A%A4%ED%8A%B8")) {
    fail += 1;
    console.log(`  ✗ 한글 인코딩 실패: ${r.searchUrl}`);
  } else {
    pass += 1;
    console.log(`  ✓ 한글 인코딩 OK`);
  }
}

console.log(`\n결과: ${pass} pass, ${fail} fail`);
if (fail > 0) {
  process.exit(1);
}
