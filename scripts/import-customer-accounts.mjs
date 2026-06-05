/**
 * 고객사 마스터(customer_accounts) 일괄 적재 스크립트.
 *
 * 입력:
 *   - 엑셀(.xlsx) 을 "다른 이름으로 저장 → CSV UTF-8" 로 변환한 파일 경로
 *   - .env.local 에서 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 자동 로드
 *
 * 사용법:
 *   node scripts/import-customer-accounts.mjs ./private/2026_고객리스트.csv
 *
 * 보안 정책 (중요):
 *   - 입력 파일은 고객사명/주소/사업자번호 같은 민감 정보를 포함한다.
 *   - 절대 public/ 폴더에 두지 말 것.
 *   - .gitignore 에 의해 차단되는 경로에 두는 것을 권장: ./private/, ./data/customer-list/,
 *     혹은 파일명이 "2026_고객리스트*" 또는 "고객리스트*" 로 시작하면 자동 ignore.
 *
 * 의존성 정책:
 *   - 새 npm 패키지를 추가하지 않고, 이미 설치된 @supabase/supabase-js 만 사용한다.
 *   - dotenv 도 추가하지 않고 .env.local 을 가벼운 파서로 직접 읽는다.
 *   - CSV 파서는 RFC 4180 기본 케이스(따옴표, 따옴표 안 콤마/줄바꿈) 만 처리한다.
 *
 * 입력 CSV 헤더 (한국어 그대로):
 *   고객사명, 지방/수도권 구분, Named, 26 테리토리, 지역 구분, 본사주소, 사업자번호
 *
 * 적재 대상 테이블:
 *   public.customer_accounts (supabase/customer_accounts.sql 참고)
 *   onConflict: customer_name_norm (정규화된 이름이 같으면 덮어쓰기)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(envPath) {
  let text;
  try {
    text = readFileSync(envPath, "utf-8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

/**
 * RFC 4180 호환 CSV 파서. 헤더 1줄 + 데이터 다수 줄.
 * 따옴표로 둘러싼 필드 안에서 ',' 와 줄바꿈, 이스케이프된 ""(" 자체) 처리.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (ch === "\r") {
      // skip — \n 이 따라온다
    } else if (ch === '"' && cur === "") {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  // 마지막 빈 줄 제거
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) {
    rows.pop();
  }
  return rows;
}

/**
 * 고객사명 정규화.
 *  - 괄호 () 와 그 안의 내용 제거
 *  - "주식회사", "(주)", "㈜", "유한회사", "재단법인" 등 법인 표기 제거
 *  - 공백 모두 제거
 *  - 소문자화
 * 한국어/영문 혼합 모두에서 substring 매칭의 정확도를 높이기 위함.
 */
export function normalizeCustomerName(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\([^)]*\)/g, "")
    .replace(/[（）()]/g, "")
    .replace(/㈜|\(주\)|주식회사/g, "")
    .replace(/㈜|\(유\)|유한회사/g, "")
    .replace(/\(재\)|재단법인/g, "")
    .replace(/\(사\)|사단법인/g, "")
    .replace(/\(학\)|학교법인/g, "")
    .replace(/\(의\)|의료법인/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

function buildHeaderIndex(headerRow) {
  const map = new Map();
  for (let i = 0; i < headerRow.length; i++) {
    const name = (headerRow[i] ?? "").trim();
    if (!name) continue;
    if (!map.has(name)) map.set(name, i);
  }
  return map;
}

function pick(row, idx) {
  if (idx == null || idx < 0) return null;
  const v = (row[idx] ?? "").trim();
  return v ? v : null;
}

/**
 * 같은 customer_name_norm 을 가진 두 행 중 어느 쪽을 남길지 결정한다.
 * 우선순위:
 *   1) business_number 가 있는 행
 *   2) territory 가 있는 행
 *   3) account_type 이 있는 행
 *   4) region 이 있는 행
 *   5) 그래도 같으면 뒤에 나온 행(candidate)으로 덮어쓴다.
 */
function pickBetter(existing, candidate) {
  const fields = ["business_number", "territory", "account_type", "region"];
  for (const f of fields) {
    const e = existing[f] != null && String(existing[f]).trim() !== "";
    const c = candidate[f] != null && String(candidate[f]).trim() !== "";
    if (e !== c) return c ? candidate : existing;
  }
  return candidate;
}

async function main() {
  const cwd = process.cwd();
  loadEnvLocal(resolve(cwd, ".env.local"));

  const csvArg = process.argv[2];
  if (!csvArg) {
    console.error("사용법: node scripts/import-customer-accounts.mjs <CSV 경로>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "환경변수 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 .env.local 에 설정하세요.",
    );
    process.exit(1);
  }

  const csvPath = resolve(cwd, csvArg);
  let raw;
  try {
    raw = readFileSync(csvPath, "utf-8");
  } catch (err) {
    console.error(`CSV 파일을 읽지 못했습니다: ${csvPath}`);
    console.error(err);
    process.exit(1);
  }
  const stripped = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const rows = parseCsv(stripped);

  if (rows.length < 2) {
    console.error("CSV 가 비어있거나 헤더만 존재합니다.");
    process.exit(1);
  }

  const headerIdx = buildHeaderIndex(rows[0]);
  const idxName = headerIdx.get("고객사명");
  const idxRegionGroup = headerIdx.get("지방/수도권 구분");
  const idxNamed = headerIdx.get("Named");
  const idxTerritory = headerIdx.get("26 테리토리");
  const idxRegion = headerIdx.get("지역 구분");
  const idxAddress = headerIdx.get("본사주소");
  const idxBizNo = headerIdx.get("사업자번호");

  if (idxName == null) {
    console.error('"고객사명" 헤더를 찾지 못했습니다. 실제 헤더:', rows[0]);
    process.exit(1);
  }

  // 같은 customer_name_norm 을 가진 행이 CSV 에 여러 개 있으면
  // Supabase 의 한 upsert batch 안에서 같은 unique key 를 두 번 건드리게 되어
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" 에러가 난다.
  // 따라서 upsert 보내기 전에 norm 기준으로 client-side dedup 을 해야 한다.
  const byNorm = new Map();
  let skippedEmpty = 0;
  let totalCandidates = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const customerName = (r[idxName] ?? "").trim();
    if (!customerName) {
      skippedEmpty += 1;
      continue;
    }
    const norm = normalizeCustomerName(customerName);
    if (!norm) {
      skippedEmpty += 1;
      continue;
    }

    totalCandidates += 1;
    const candidate = {
      customer_name: customerName,
      customer_name_norm: norm,
      // customer_group 은 v1 에서는 NULL. (엑셀에 명확한 그룹 컬럼 없음)
      customer_group: null,
      account_type: pick(r, idxNamed),
      territory: pick(r, idxTerritory),
      region_group: pick(r, idxRegionGroup),
      region: pick(r, idxRegion),
      address: pick(r, idxAddress),
      business_number: pick(r, idxBizNo),
      source_file: "2026_고객리스트",
      updated_at: new Date().toISOString(),
    };

    const existing = byNorm.get(norm);
    byNorm.set(norm, existing ? pickBetter(existing, candidate) : candidate);
  }

  const records = [...byNorm.values()];
  const dupRemoved = totalCandidates - records.length;

  console.log(`CSV 분석: 데이터 ${rows.length - 1}행 → 전체 후보 ${totalCandidates}건 (빈 이름 ${skippedEmpty}건)`);
  console.log(`정규화 중복 제거 후 ${records.length}건`);
  console.log(`중복 제거 ${dupRemoved}건`);

  if (records.length === 0) {
    console.log("적재할 row 가 없습니다.");
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("customer_accounts")
      .upsert(chunk, { onConflict: "customer_name_norm" });
    if (error) {
      console.error(`청크 ${i}-${i + chunk.length} upsert 실패:`, error);
      process.exit(1);
    }
    total += chunk.length;
    console.log(`  진행 ${total}/${records.length}`);
  }

  console.log(`완료: customer_accounts 에 ${total} 건 upsert.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
