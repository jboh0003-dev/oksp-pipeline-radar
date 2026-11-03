"use client";

import { useEffect, useMemo, useState } from "react";

export type InsightDelivery = {
  receipt_date: string; amount: number | null; product_id: string | null;
  product_name: string; supplier_name: string | null;
};

const compact = (value: number) => value >= 1e8
  ? `${(value / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`
  : value >= 1e4 ? `${Math.round(value / 1e4).toLocaleString("ko-KR")}만` : `${value.toLocaleString("ko-KR")}원`;

export default function VendorInsight({ rows, year, selectedMonth, onMonth }: {
  rows: InsightDelivery[]; year: string; selectedMonth: string | null;
  onMonth: (month: string | null) => void;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const months = useMemo(() => {
    const years = year === "전체" ? [...new Set(rows.map(row => row.receipt_date.slice(0, 4)))].sort() : [year];
    return years.flatMap(y => Array.from({ length: 12 }, (_, index) => {
      const key = `${y}-${String(index + 1).padStart(2, "0")}`;
      const matching = rows.filter(row => row.receipt_date.startsWith(key));
      return { key, count: matching.length, amount: matching.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) };
    }));
  }, [rows, year]);
  const maxAmount = Math.max(1, ...months.map(month => month.amount));
  const products = useMemo(() => {
    const map = new Map<string, { id: string | null; name: string; count: number; amount: number }>();
    for (const row of rows.filter(row => !selectedMonth || row.receipt_date.startsWith(selectedMonth))) {
      const key = row.product_id || row.product_name;
      const previous = map.get(key) ?? { id: row.product_id, name: row.product_name, count: 0, amount: 0 };
      previous.count += 1; previous.amount += Number(row.amount ?? 0); map.set(key, previous);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count).slice(0, 6);
  }, [rows, selectedMonth]);
  const imageIds = products.map(p => p.id).filter((id): id is string => !!id && /^\d{8}$/.test(id));
  const idsKey = imageIds.join(",");
  useEffect(() => {
    if (!idsKey) return;
    const controller = new AbortController();
    fetch(`/api/competitive-product-images?ids=${idsKey}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : { images: {} })
      .then(data => { if (!controller.signal.aborted) setImages(prev => ({ ...prev, ...data.images })); })
      .catch(() => {});
    return () => controller.abort();
  }, [idsKey]);

  return <div className="border-b border-white/10 bg-[#09172d] px-5 py-6 text-white">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[11px] font-bold tracking-[.22em] text-cyan-300">PROCUREMENT INTELLIGENCE</p>
        <h3 className="mt-1 text-lg font-bold">월별 조달 추이</h3></div>
      {selectedMonth && <button type="button" onClick={() => onMonth(null)} className="rounded-full border border-cyan-400/50 px-3 py-1 text-xs font-semibold text-cyan-200">전체 기간 보기</button>}
    </div>
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-max items-end gap-2 border-b border-white/10 px-2 pb-3 pt-4" role="group" aria-label="월별 조달 공급금액과 건수">
        {months.map(month => {
          const height = month.amount ? Math.max(12, Math.round(month.amount / maxAmount * 150)) : 3;
          const active = selectedMonth === month.key;
          return <button type="button" key={month.key} onClick={() => onMonth(active ? null : month.key)} aria-pressed={active}
            title={`${month.key} · ${month.count}건 · ${compact(month.amount)}`}
            className={`group flex w-[70px] shrink-0 flex-col items-center rounded-lg px-1 pb-1 text-center transition-colors hover:bg-white/10 ${active ? "bg-cyan-400/15 ring-1 ring-cyan-400/60" : ""}`}>
            <span className="mb-2 text-[11px] font-semibold tabular-nums text-cyan-100">{month.amount ? compact(month.amount) : ""}</span>
            <span className="relative flex h-[155px] w-full items-end justify-center" style={{ perspective: "220px" }}>
              <span className={`relative block w-9 rounded-t-[3px] shadow-[0_0_24px_rgba(34,211,238,.24)] transition-all duration-300 group-hover:brightness-125 ${active ? "bg-gradient-to-t from-blue-700 to-cyan-300" : "bg-gradient-to-t from-blue-800 to-blue-400"}`}
                style={{ height, transform: "rotateX(5deg) skewY(-3deg)", transformOrigin: "bottom" }}>
                <span className="absolute -right-[6px] top-[3px] h-full w-[6px] origin-left skew-y-[38deg] bg-blue-950/90" />
                <span className="absolute -top-[5px] left-[3px] h-[5px] w-full skew-x-[48deg] bg-cyan-200/80" />
              </span>
            </span>
            <span className="mt-2 text-xs font-bold tabular-nums">{month.key.slice(5)}월</span>
            <span className="text-[11px] tabular-nums text-slate-400">{month.count}건</span>
            {month.key.endsWith("-12") && <span className="text-[10px] text-slate-500">{month.key.slice(0, 4)}</span>}
          </button>;
        })}
      </div>
    </div>
    <div className="mt-4 flex items-center justify-between"><h3 className="text-sm font-bold">주요 제품</h3><span className="text-xs text-slate-400">{selectedMonth ?? "전체 기간"}</span></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {products.map(product => <div key={product.id || product.name} className="flex min-w-0 gap-3 rounded-xl border border-white/10 bg-white/[.06] p-3">
        {product.id && images[product.id] && !broken[product.id] && <img src={images[product.id]} alt={`${product.name} 나라장터 등록 이미지`} loading="lazy" onError={() => setBroken(prev => ({ ...prev, [product.id!]: true }))} className="h-16 w-16 shrink-0 rounded-lg bg-white object-contain" />}
        <div className="min-w-0"><p className="line-clamp-2 text-sm font-semibold leading-5">{product.name}</p>
          <p className="mt-1 text-xs tabular-nums text-cyan-200">{product.count}건 · {compact(product.amount)}</p>
          {product.id && <p className="mt-1 text-[11px] text-slate-400">식별번호 {product.id}</p>}</div>
      </div>)}
    </div>
  </div>;
}
