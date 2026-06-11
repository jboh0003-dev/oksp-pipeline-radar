/**
 * G2B Open API 의 페이지 단위 반복 수집 helper.
 *
 *  - 1페이지를 받아 totalCount 로 전체 페이지 수 산정.
 *  - 이후 페이지를 concurrency 제한으로 병렬 호출.
 *  - 각 페이지의 item 들을 모아 반환. 페이지별 에러도 같이 반환.
 *
 * 호출부는 endpoint 마다 sourceApi 라벨을 지정해 받은 데이터의 출처를 추적할 수 있다.
 */

import {
  buildG2bUrl,
  fetchG2bApi,
  type G2bRequestOptions,
  type G2bResult,
} from "@/lib/g2b/client";
import { parseG2bResponse } from "@/lib/g2b/normalize";

export type G2bPagedPage = {
  endpoint: string;
  pageNo: number;
  totalCount: number | null;
  items: Record<string, unknown>[];
  /** Open API 응답의 header.resultCode 등. */
  resultCode: string | null;
  resultMsg: string | null;
  /** 페이지 단위 수집 시간(ms). */
  durationMs: number;
  /** 호출 결과 자체. retry 횟수 / status 등 디버깅용. */
  result: G2bResult;
  /** 호출이 실패했다면 사유 문자열. 성공이면 null. */
  error: string | null;
};

export type G2bPagedOptions = {
  /** baseUrl: ".../1230000/ao/HrcspSsstndrdInfoService" */
  baseUrl: string;
  /** "getPublicPrcureThngInfoServcPPSSrch" 같은 endpoint 이름. */
  endpoint: string;
  /** "용역", "물품" 같이 사람이 읽기 좋은 식별. logging / 화면 노출용. */
  sourceApi?: string;
  /** ServiceKey (decoded 또는 encoded 둘 다 OK). */
  serviceKey: string;
  /** 추가 query 파라미터. inqryBgnDt, inqryEndDt 등. */
  baseParams: Record<string, string | number>;
  numOfRows: number;
  /** 한 endpoint 당 최대 페이지. */
  maxPages: number;
  /** 페이지 동시 호출 수. 기본 3. */
  concurrency?: number;
  /** 호출별 timeout(ms). 기본 15s. */
  timeoutMs?: number;
  /** retry 횟수. 기본 3. */
  retries?: number;
};

/** 작업 N개를 concurrency 제한으로 실행. */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      out[idx] = await tasks[idx]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return out;
}

async function fetchOnePage(
  options: G2bPagedOptions,
  pageNo: number,
): Promise<G2bPagedPage> {
  const { baseUrl, endpoint, serviceKey, baseParams, numOfRows } = options;
  const url = buildG2bUrl(baseUrl, endpoint, {
    ...baseParams,
    serviceKey,
    pageNo,
    numOfRows,
    type: "json",
  });
  const startedAt = Date.now();
  const requestOptions: G2bRequestOptions = {
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    label: options.sourceApi ?? endpoint,
  };
  const result = await fetchG2bApi(url, requestOptions);
  const durationMs = Date.now() - startedAt;

  if (!result.ok) {
    return {
      endpoint,
      pageNo,
      totalCount: null,
      items: [],
      resultCode: result.debug.resultCode,
      resultMsg: result.debug.resultMsg,
      durationMs,
      result,
      error: result.error,
    };
  }

  const parsed = parseG2bResponse(result.data);
  return {
    endpoint,
    pageNo,
    totalCount: parsed.totalCount,
    items: parsed.items,
    resultCode: parsed.header?.resultCode ?? null,
    resultMsg: parsed.header?.resultMsg ?? null,
    durationMs,
    result,
    error: null,
  };
}

/**
 * 한 endpoint 의 1..N 페이지를 모두 받아오는 helper.
 *
 *  1) 1페이지를 받아 totalCount 추정.
 *  2) 추가 페이지 task 생성 → concurrency 제한으로 병렬 실행.
 *  3) 모든 페이지 수집이 끝나면 page 배열과 합쳐진 item 배열을 반환.
 *
 *  실패한 페이지가 있어도 다른 페이지는 계속 처리. 호출부가 page.error 로 페이지 단위 에러를
 *  CollectionError 에 매핑한다.
 */
export async function fetchG2bPaged(options: G2bPagedOptions): Promise<{
  pages: G2bPagedPage[];
  items: Record<string, unknown>[];
  totalCount: number | null;
}> {
  const concurrency = options.concurrency ?? 3;
  const firstPage = await fetchOnePage(options, 1);
  const pages: G2bPagedPage[] = [firstPage];
  const items: Record<string, unknown>[] = [...firstPage.items];

  const totalCount = firstPage.totalCount;
  // 1페이지가 실패했더라도 retry 후 결과를 받아본 상태이므로 여기서 즉시 종료.
  if (firstPage.error || totalCount == null || totalCount <= options.numOfRows) {
    return { pages, items, totalCount };
  }

  const totalPages = Math.min(
    options.maxPages,
    Math.max(1, Math.ceil(totalCount / options.numOfRows)),
  );
  if (totalPages < 2) return { pages, items, totalCount };

  const tasks: (() => Promise<G2bPagedPage>)[] = [];
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    tasks.push(() => fetchOnePage(options, pageNo));
  }
  const more = await runWithConcurrency(tasks, concurrency);
  for (const p of more) {
    pages.push(p);
    if (!p.error) items.push(...p.items);
  }
  return { pages, items, totalCount };
}
