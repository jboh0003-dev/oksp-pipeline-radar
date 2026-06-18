/**
 * 사전규격공고 (HrcspSsstndrdInfoService) 호출용 ServiceKey 해석기.
 *
 * 입찰공고와 사전규격공고는 공공데이터포털에서 *서로 다른 서비스* 로 신청한다 —
 * "입찰공고는 되는데 사전규격공고만 안 되는" 케이스의 90% 가 여기서 난다.
 *
 *  - 사용자는 사전규격 신청을 별도로 처리한 뒤, 새로 발급받은 ServiceKey 를
 *    `NARA_PRESPEC_API_KEY` (권장) 로 등록한다.
 *  - 한 키로 양쪽 모두 신청한 경우 `NARA_API_KEY` 한 개만 등록해도 동작.
 *  - 입찰공고용 변수(`G2B_PRESPEC_SERVICE_KEY` / `G2B_SERVICE_KEY`) 도 운영 호환을 위해 fallback 으로 유지.
 *  - 모두 없으면 `present: false` — 호출부에서 명확한 에러를 반환해야 한다.
 *
 * 인증키 자체는 공공데이터포털의 "Decoding 인증키" 권장 (즉 raw 문자열, % 가 들어있지 않은 것).
 *  - lib/g2b/client.ts 의 buildQueryString 이 자동으로 encodeURIComponent 처리.
 *  - 이미 인코딩된 키(% 포함) 도 두 번 인코딩되지 않도록 안전하게 처리한다.
 *  - 로그에 ServiceKey 전체를 절대 출력하지 않는다 (마스킹된 값만 응답에 노출).
 */

export type PreSpecServiceKeySource =
  | "NARA_PRESPEC_API_KEY"
  | "NARA_API_KEY"
  | "G2B_PRESPEC_SERVICE_KEY"
  | "G2B_SERVICE_KEY";

export type PreSpecServiceKeyResolution =
  | {
      present: true;
      key: string;
      source: PreSpecServiceKeySource;
      /** 키 길이 (마스킹 표시용). */
      length: number;
      /** 마스킹된 표현 — 첫 4자 + …+ 끝 4자. (디버그 응답에만 노출) */
      masked: string;
      /** 키에 % 가 포함됐는지 = 이미 URL-encoded 형태로 입력됐는지. */
      looksEncoded: boolean;
    }
  | {
      present: false;
      key: null;
      source: null;
      length: 0;
      masked: null;
      looksEncoded: false;
      /** 검사한 env var 이름들. */
      checkedEnvVars: PreSpecServiceKeySource[];
    };

const PRE_SPEC_KEY_PRIORITY: PreSpecServiceKeySource[] = [
  // 1순위: 사전규격 전용 권장 변수.
  "NARA_PRESPEC_API_KEY",
  // 2순위: 한 키로 양쪽 모두 신청한 사용자가 자주 쓰는 단일 변수.
  //        (한 키로 입찰/사전규격 모두 동작하면 이것 하나만 등록해도 끝.)
  "NARA_API_KEY",
  // 3순위/4순위: 운영 호환 — 기존 배포 환경의 기존 변수도 그대로 살린다.
  "G2B_PRESPEC_SERVICE_KEY",
  "G2B_SERVICE_KEY",
];

function maskKey(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function resolvePreSpecServiceKey(): PreSpecServiceKeyResolution {
  for (const source of PRE_SPEC_KEY_PRIORITY) {
    const raw = process.env[source];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    return {
      present: true,
      key: trimmed,
      source,
      length: trimmed.length,
      masked: maskKey(trimmed),
      looksEncoded: /%[0-9A-Fa-f]{2}/.test(trimmed),
    };
  }
  return {
    present: false,
    key: null,
    source: null,
    length: 0,
    masked: null,
    looksEncoded: false,
    checkedEnvVars: PRE_SPEC_KEY_PRIORITY,
  };
}
