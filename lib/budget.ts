/**
 * 예산(추정금액) 파싱 및 표시 유틸.
 *
 * Supabase notices.budget 은 다양한 형태의 문자열로 들어온다:
 *   "12억 4,000만원"  /  "1,234,567,890원"  /  "320000000"  /  "-"  /  null
 * 화면에서는 가독성을 위해 항상 "320,000,000원 (3억 2천만 원)" 형태로 통일하고,
 * 정렬·집계가 필요한 곳에서는 숫자(원) 값을 함께 사용한다.
 */

export type BudgetInfo = {
  /** 원본 문자열을 trim 한 값 (없으면 null). */
  raw: string | null;
  /** 파싱에 성공한 경우 원 단위 정수. 0 이거나 파싱 실패 시 null. */
  amount: number | null;
  /** "320,000,000원" — amount 가 있을 때만. */
  formatted: string | null;
  /** "(3억 2천만 원)" 같은 한글 금액. amount 가 있을 때만. */
  korean: string | null;
  /** UI 에서 한 줄로 노출하기 좋은 형태. amount 가 없으면 안내 문구. */
  display: string;
  /** "예산 미공개" / "금액 정보 없음" 처럼 표시되어야 하는지 (배지 톤 분기용). */
  isMissing: boolean;
};

const MISSING_LABEL = "예산 미공개";
const ZERO_LABEL = "금액 정보 없음";

/**
 * "12억 4,000만원" 같은 한글 표기 + 콤마 + "원" 표기를 모두 흡수하는 파서.
 * 숫자만 들어와도 정상 처리.
 *
 * 반환값은 원 단위 정수 또는 null.
 */
export function parseBudgetAmount(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return Math.round(raw);
  }

  const text = raw.trim();
  if (!text || text === "-") return null;

  // 1) 한글 단위(억/만/천)가 포함된 경우 → 단위별로 분해
  if (/[억만천]/.test(text)) {
    const cleaned = text.replace(/[,\s]/g, "").replace(/원$/, "");
    let total = 0;
    let parsed = false;

    const eokMatch = cleaned.match(/(\d+(?:\.\d+)?)억/);
    if (eokMatch) {
      total += Math.round(Number(eokMatch[1]) * 100_000_000);
      parsed = true;
    }
    const manMatch = cleaned.match(/(\d+(?:\.\d+)?)만/);
    if (manMatch) {
      total += Math.round(Number(manMatch[1]) * 10_000);
      parsed = true;
    }
    const cheonMatch = cleaned.match(/(\d+(?:\.\d+)?)천(?!만|억)/);
    if (cheonMatch) {
      total += Math.round(Number(cheonMatch[1]) * 1_000);
      parsed = true;
    }
    // "12억4000만원" 같은 케이스에서 만 단위 뒤에 남은 끝자리(예: "12억4,000만 5,000원")
    const tailMatch = cleaned.match(/만(\d+)$/);
    if (tailMatch) {
      total += Number(tailMatch[1]);
      parsed = true;
    }
    if (parsed && total > 0) return total;
  }

  // 2) 숫자(콤마 포함) + "원" 형태
  const digitsOnly = text.replace(/[^\d]/g, "");
  if (digitsOnly.length > 0) {
    const n = Number(digitsOnly);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

/** 콤마 + "원". amount 가 null 이면 null 반환. */
export function formatBudgetWon(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

/**
 * 한글 금액 표기.
 *
 * 정책:
 *  - 1억 이상   : "38억 4,359만 원" 처럼 억/만 단위까지만 표기. 만 미만은 버린다.
 *  - 1억 미만   : "8,500만 원" 처럼 만 단위로만 표기.
 *  - 만 원 미만 : "1,000원" 처럼 원 단위로 콤마 + "원".
 *  - 만 단위가 0 인 경우(예: 15억) : "15억 원" 처럼 0 만 부분은 생략.
 *
 * 모든 숫자 부분은 toLocaleString("ko-KR") 으로 천 단위 콤마를 적용한다.
 */
export function formatBudgetKorean(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const v = Math.round(amount);

  if (v < 10_000) {
    // 만 원 미만은 단위 없이 원 단위로만 표기.
    return `${v.toLocaleString("ko-KR")}원`;
  }

  const eok = Math.floor(v / 100_000_000);
  const remainAfterEok = v % 100_000_000;
  const man = Math.floor(remainAfterEok / 10_000);
  // 만 미만(원 단위 잔여) 은 의도적으로 표기에서 제외 (보기 좋게 끊는다).

  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만`);

  if (parts.length === 0) {
    // 도달하지 않을 가지(eok=0 && man=0 && v>=10000)는 방어 fallback.
    return `${v.toLocaleString("ko-KR")}원`;
  }
  return `${parts.join(" ")} 원`;
}

/**
 * 외부에서 자주 쓰는 별칭. 새 코드는 formatCurrency / formatKoreanCurrency 를 권장.
 *  - formatCurrency(amount)        : "3,843,590,600원"
 *  - formatKoreanCurrency(amount)  : "38억 4,359만 원"
 *
 * 0 / null / undefined 등 표시할 금액이 없는 경우 호출부에서 "금액 정보 없음" 으로 처리하기 쉽도록
 * 동일하게 null 을 반환한다.
 */
export const formatCurrency = formatBudgetWon;
export const formatKoreanCurrency = formatBudgetKorean;

/**
 * 화면에 한 줄로 노출하기 좋은 통합 포맷.
 *  - 정상: "320,000,000원 (3억 2천만 원)"
 *  - 0 / 음수: "금액 정보 없음"
 *  - 비어있거나 파싱 실패: "예산 미공개"
 */
export function getBudgetInfo(raw: string | number | null | undefined): BudgetInfo {
  const trimmed =
    raw == null ? null : typeof raw === "number" ? String(raw) : raw.trim() || null;
  const amount = parseBudgetAmount(raw);

  if (amount != null && amount > 0) {
    const formatted = formatBudgetWon(amount);
    const korean = formatBudgetKorean(amount);
    return {
      raw: trimmed,
      amount,
      formatted,
      korean,
      display: korean ? `${formatted} (${korean})` : (formatted ?? MISSING_LABEL),
      isMissing: false,
    };
  }

  // raw 가 "-" 나 빈 값
  if (!trimmed || trimmed === "-") {
    return {
      raw: trimmed,
      amount: null,
      formatted: null,
      korean: null,
      display: MISSING_LABEL,
      isMissing: true,
    };
  }

  // 텍스트는 있는데 숫자로 못 뽑은 경우 (예: "비공개", "별첨 참조")
  // 원본을 그대로 보여주되, 정렬에는 0 으로 취급.
  return {
    raw: trimmed,
    amount: null,
    formatted: null,
    korean: null,
    display: trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed,
    isMissing: true,
  };
}

/** 정렬 키. amount 가 있으면 그 값, 없으면 -1 (항상 맨 뒤로 보내기 위함). */
export function getBudgetSortKey(raw: string | number | null | undefined): number {
  const a = parseBudgetAmount(raw);
  return a == null ? -1 : a;
}
