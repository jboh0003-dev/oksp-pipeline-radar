"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const Monthly3DChart = dynamic(() => import("./Monthly3DChart"), { ssr: false });

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
      <div className="relative min-w-max rounded-xl border border-white/10 bg-gradient-to-b from-[#0b2343] to-[#071529] px-2 pt-4" style={{ width: Math.max(700, months.length * 84 + 16) }}>
        <Monthly3DChart months={months} selectedMonth={selectedMonth} onMonth={onMonth} />
        <div className="grid border-t border-white/10 pb-3 pt-2" style={{ gridTemplateColumns: `repeat(${months.length}, 84px)` }} role="group" aria-label="월별 조달 공급금액과 건수">
          {months.map(month => {
            const active = selectedMonth === month.key;
            return <button type="button" key={month.key} onClick={() => onMonth(active ? null : month.key)} aria-pressed={active}
              title={`${month.key} · ${month.count}건 · ${month.amount.toLocaleString("ko-KR")}원`}
              className={`mx-1 flex flex-col items-center rounded-lg py-1 text-center transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300 ${active ? "bg-cyan-400/15 text-cyan-200" : "text-white"}`}>
              <span className="text-xs font-bold tabular-nums">{month.key.slice(5)}월</span>
              <span className="text-[11px] tabular-nums text-slate-400">{month.count}건</span>
              {year === "전체" && <span className="text-[10px] text-slate-500">{month.key.slice(0, 4)}</span>}
            </button>;
          })}
        </div>
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
