/**
 * 사전규격 매칭 로직 회귀 검증 — 사용자 정책 (2026-06).
 *
 * 검증 대상:
 *  1. 강한 제외 키워드 (여행/급식/CCTV/공사) 가 제목에 들어가면 → 제외 (matched 가 아니어야 함).
 *  2. 강한 제품 키워드 (클라우드 마이그레이션/PaaS/CMP) 가 들어가면 → matched + 제외 아님.
 *  3. 제외 키워드 + 강한 제품 키워드 동시 등장 → exclusionOverridden=true (제외 아님).
 *  4. 일반 단어("인프라" 만 등장) 단독으로는 제품 매칭 안 됨 (단순한 사업도 제품으로 잘못 잡히면 안 됨).
 *
 * Usage:
 *   npx tsx scripts/verify-prespec-match.mjs
 *   (또는 빌드된 .next 의 컴파일된 코드를 사용)
 */
// 이 스크립트는 npx tsx 로 실행해 .ts 모듈을 직접 import 한다.
//   npx tsx scripts/verify-prespec-match.mjs

import { matchPreSpec } from "../lib/preSpec/match.ts";
import { normalizePreSpecItem } from "../lib/preSpec/normalize.ts";

let pass = 0;
let fail = 0;

function check(name, expected, actual) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}

console.log("=== 사전규격 matchPreSpec 회귀 ===");

// 1. 강한 제외 + 제품 키워드 없음 → exclusionHits>0, exclusionOverridden=false, products=[].
{
  const r = matchPreSpec("2026년 수학여행 일반용역", "수학여행 인솔 및 안전관리 용역");
  check("[1] 수학여행 → 제외 hits ≥ 1", true, r.exclusionHits.length >= 1);
  check("[1] 수학여행 → exclusionOverridden=false", false, r.exclusionOverridden);
  check("[1] 수학여행 → products empty", [], r.products);
}

// 2. 일반 "인프라" 단독 → 제품 매칭 안 됨.
{
  const r = matchPreSpec("학교 정보시스템 인프라 유지보수", "");
  // "정보시스템 인프라" 는 CONTRABASS strong 에 있으므로 score 3 이 나오긴 한다.
  // 하지만 "인프라" 단독은 strong 에서 빠져 있어 일반 사업 제목엔 안 잡힘.
  check("[2] 정보시스템 인프라 → CONTRABASS 매칭 (사용자 명시)", true, r.products.includes("CONTRABASS"));
}

// 3. 일반 "유지보수 인프라" → "인프라" 단독으론 더 이상 매칭 안 됨.
{
  const r = matchPreSpec("XX청 인프라 유지보수 사업", "");
  check("[3] '인프라 유지보수' 단독 → 제품 매칭 없음", [], r.products);
}

// 4. 클라우드 마이그레이션 → CONTRABASS 매칭.
{
  const r = matchPreSpec("XX청 클라우드 마이그레이션 사업", "VMware 환경에서 OpenStack 으로 전환");
  check("[4] 클라우드 마이그레이션 → CONTRABASS", true, r.products.includes("CONTRABASS"));
  check("[4] exclusionHits = 0", 0, r.exclusionHits.length);
}

// 5. 제외 + 제품 동시 → exclusionOverridden=true, 제품 채택.
{
  const r = matchPreSpec(
    "XX청 노트북 구매 및 클라우드 마이그레이션 통합 사업",
    "VMware 전환 포함",
  );
  check("[5] 노트북 구매+클라우드 → exclusionHits ≥ 1", true, r.exclusionHits.length >= 1);
  check("[5] 노트북 구매+클라우드 → exclusionOverridden=true", true, r.exclusionOverridden);
  check("[5] 노트북 구매+클라우드 → CONTRABASS 채택", true, r.products.includes("CONTRABASS"));
}

// 6. PaaS → VIOLA 매칭.
{
  const r = matchPreSpec("XX부 PaaS 플랫폼 구축", "쿠버네티스 기반 컨테이너 플랫폼");
  check("[6] PaaS → VIOLA", true, r.products.includes("VIOLA"));
}

// 7. CMP → CMP 매칭.
{
  const r = matchPreSpec("멀티클라우드 통합 관리 (CMP) 도입", "");
  check("[7] CMP+멀티클라우드 → CMP", true, r.products.includes("CMP"));
}

// 8. CCTV 단순 구매 → 제외.
{
  const r = matchPreSpec("학교 CCTV 추가 설치 및 유지보수", "");
  check("[8] CCTV → exclusionHits ≥ 1", true, r.exclusionHits.length >= 1);
  check("[8] CCTV → 제품 매칭 없음 (강제 override 안 됨)", [], r.products);
}

// 9. normalize 확인 — 수학여행 사업의 recommendation 이 "제외" 인지.
{
  const item = normalizePreSpecItem(
    {
      bfSpecRgstNo: "TEST-001",
      prdctClsfcNoNm: "2026년 수학여행 인솔 용역",
      bsnsNm: "수학여행 인솔 및 안전관리",
      orderInsttNm: "XX 교육청",
      asignBdgtAmt: 50000000,
      opninRgstClseDt: "2026-12-31 18:00",
    },
    "TEST-001",
  );
  check("[9] 수학여행 사업 → recommendation === '제외'", "제외", item.recommendation);
  check("[9] 수학여행 사업 → products empty", [], item.products);
}

// 10. normalize 확인 — 클라우드 마이그레이션 사업의 recommendation.
{
  const item = normalizePreSpecItem(
    {
      bfSpecRgstNo: "TEST-002",
      prdctClsfcNoNm: "XX청 클라우드 마이그레이션 사업",
      bsnsNm: "VMware 환경에서 OpenStack 으로의 클라우드 전환",
      orderInsttNm: "XX청",
      asignBdgtAmt: 1500000000,
      opninRgstClseDt: "2030-12-31 18:00",
    },
    "TEST-002",
  );
  check("[10] 클라우드 마이그레이션 → CONTRABASS", true, item.products.includes("CONTRABASS"));
  check(
    "[10] 클라우드 마이그레이션 → 핵심검토 또는 의견제출검토",
    true,
    ["핵심검토", "의견제출검토"].includes(item.recommendation),
  );
}

console.log(`\n총 ${pass + fail}건 — PASS=${pass} / FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
