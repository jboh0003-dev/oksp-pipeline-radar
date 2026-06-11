/**
 * G2B 응답을 모듈 어디서나 같은 방식으로 정규화하기 위한 helper.
 *
 *  - response.body.items 가 배열 / { item: object } / { item: object[] } / 단일 객체 / null 등
 *    어떤 형태든 항상 Record<string, unknown>[] 로 정규화한다.
 *  - parseG2bResponse 는 header / body / items / totalCount 을 한 번에 분리해서 돌려준다.
 *  - 사전규격(/ao/) 와 입찰공고(/ad/) 모두 같은 패턴이라 공통 사용.
 */

import { getResponseHeader, getResponseTotalCount, type G2bResultHeader } from "@/lib/g2b/client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pushIfRecord(target: Record<string, unknown>[], v: unknown) {
  if (isRecord(v)) target.push(v);
}

/**
 * 다양한 형태의 items 노드를 Record<string, unknown>[] 로 정규화.
 *
 * 입력 케이스:
 *  - undefined / null / "" → []
 *  - Record<string, unknown>[]  →  그대로 (record 만 남기고 filter)
 *  - Record<string, unknown>    →  단일 객체. items[0] 로 취급
 *  - { item: ... }              →  inner 재귀
 *  - { item: [...] }            →  inner 재귀
 */
export function normalizeItems(value: unknown): Record<string, unknown>[] {
  if (value == null) return [];
  if (typeof value === "string" && !value.trim()) return [];

  if (Array.isArray(value)) {
    const out: Record<string, unknown>[] = [];
    for (const entry of value) {
      if (isRecord(entry) && "item" in entry) {
        out.push(...normalizeItems((entry as Record<string, unknown>).item));
      } else {
        pushIfRecord(out, entry);
      }
    }
    return out;
  }

  if (isRecord(value)) {
    if ("item" in value) {
      return normalizeItems((value as Record<string, unknown>).item);
    }
    return [value];
  }

  return [];
}

/**
 * Open API 응답 한 단위를 header / body / items / totalCount 로 분리.
 * 응답 형식이 약간 다른 endpoint 도 모두 같은 helper 로 처리할 수 있도록 만든 wrapper.
 */
export function parseG2bResponse(parsed: unknown): {
  header: G2bResultHeader | null;
  body: Record<string, unknown> | null;
  items: Record<string, unknown>[];
  totalCount: number | null;
} {
  const header = getResponseHeader(parsed);
  const totalCount = getResponseTotalCount(parsed);

  if (!isRecord(parsed)) {
    return { header, body: null, items: [], totalCount };
  }

  const root = parsed as Record<string, unknown>;
  const response = (root.response as Record<string, unknown> | undefined) ?? root;
  const body = (response.body as Record<string, unknown> | undefined) ?? null;
  if (!body) return { header, body: null, items: [], totalCount };

  const itemsNode = body.items;
  // body.items 가 없는 응답도 있다 — 이 경우 body 자체에 item 필드가 있는지 한 번 더 체크.
  const items = itemsNode != null ? normalizeItems(itemsNode) : normalizeItems(body);
  return { header, body, items, totalCount };
}
