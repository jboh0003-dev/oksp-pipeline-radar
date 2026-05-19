const NOTICE_FIELD_HINTS = [
  "bidntceno",
  "bidntceord",
  "bidntcenm",
  "bidnm",
  "ntcenm",
  "bsnsnm",
  "prdctnm",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function looksLikeNoticeItem(record: Record<string, unknown>): boolean {
  const keys = Object.keys(record).map((key) => key.toLowerCase());
  return keys.some((key) => NOTICE_FIELD_HINTS.some((hint) => key.includes(hint)));
}

function normalizeItem(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  return value;
}

function toItemArray(value: unknown): Record<string, unknown>[] {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeItem(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null);
  }

  const record = normalizeItem(value);
  if (!record) {
    return [];
  }

  if ("item" in record) {
    return toItemArray(record.item);
  }

  if (looksLikeNoticeItem(record)) {
    return [record];
  }

  return [];
}

/**
 * 나라장터 JSON 응답을 공고 item 배열로 정규화합니다.
 */
export function parseG2BItems(json: unknown): Record<string, unknown>[] {
  if (!isRecord(json)) {
    return [];
  }

  const body = (json as { response?: { body?: unknown } }).response?.body;
  if (!isRecord(body)) {
    return [];
  }

  const itemsNode = body.items;

  if (itemsNode == null) {
    return toItemArray(body);
  }

  if (typeof itemsNode === "string" && !itemsNode.trim()) {
    return [];
  }

  if (Array.isArray(itemsNode)) {
    return itemsNode.flatMap((node) => {
      if (isRecord(node) && "item" in node) {
        return toItemArray(node.item);
      }
      return toItemArray(node);
    });
  }

  if (!isRecord(itemsNode)) {
    return [];
  }

  if ("item" in itemsNode) {
    return toItemArray(itemsNode.item);
  }

  if (looksLikeNoticeItem(itemsNode)) {
    return [itemsNode];
  }

  return toItemArray(itemsNode);
}

export function extractG2bTotalCount(json: unknown): string | null {
  if (!isRecord(json)) {
    return null;
  }

  const body = (json as { response?: { body?: unknown } }).response?.body;
  if (!isRecord(body)) {
    return null;
  }

  const totalCount = body.totalCount ?? body.totalcount ?? body.TotalCount;
  if (totalCount == null) {
    return null;
  }

  return String(totalCount);
}
