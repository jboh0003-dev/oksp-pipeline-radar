import { NextRequest, NextResponse } from "next/server";
import { buildG2bUrl, fetchG2bApi } from "@/lib/g2b/client";

export const dynamic = "force-dynamic";
const BASE = "https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService";
const cache = new Map<string, { url: string | null; expires: number }>();

function officialImage(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!(["http:", "https:"].includes(url.protocol)) || !/(^|\.)g2b\.go\.kr$/.test(url.hostname)) return null;
    url.protocol = "https:";
    return url.toString();
  } catch { return null; }
}

async function findImage(id: string, serviceKey: string): Promise<string | null> {
  const cached = cache.get(id);
  if (cached && cached.expires > Date.now()) return cached.url;
  const url = buildG2bUrl(BASE, "getShoppingMallPrdctInfoList", {
    serviceKey, type: "json", pageNo: 1, numOfRows: 10, inqryDiv: 1, prdctIdntNo: id,
  });
  const result = await fetchG2bApi(url, { timeoutMs: 10_000, retries: 2, label: "shopping-product-image" });
  if (!result.ok) return null;
  const body = result.data.response?.body as { items?: { item?: unknown } | unknown[] } | undefined;
  const raw = body?.items;
  const item = raw && !Array.isArray(raw) && "item" in raw ? raw.item : raw;
  const rows = Array.isArray(item) ? item : item ? [item] : [];
  const matched = rows.find((row) => row && typeof row === "object" && String((row as Record<string, unknown>).prdctIdntNo ?? "") === id) as Record<string, unknown> | undefined;
  const image = officialImage(matched?.prdctImgUrl);
  cache.set(id, { url: image, expires: Date.now() + 24 * 60 * 60_000 });
  return image;
}

export async function GET(request: NextRequest) {
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(id => /^\d{8}$/.test(id)))].slice(0, 6);
  const serviceKey = process.env.G2B_SERVICE_KEY?.trim();
  if (!serviceKey || !ids.length) return NextResponse.json({ images: {} });
  const images: Record<string, string> = {};
  // 한 상세 화면의 최대 6개 품목만 조회하고, 실패한 품목은 이미지 없이 표시한다.
  for (const id of ids) {
    const image = await findImage(id, serviceKey);
    if (image) images[id] = image;
  }
  return NextResponse.json({ images }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
