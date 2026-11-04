"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { useAuth } from "@/lib/auth";
import type { RecentAward } from "@/lib/competitive/recentAwardFilter";

type ViewRow = RecentAward & { updated_at: string };
const won = (amount: number) => amount.toLocaleString("ko-KR") + "원";
const compact = (amount: number) => amount >= 1e8
  ? (amount / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "억 원"
  : (amount / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 0 }) + "만 원";
const monthKey = (date: string) => date.slice(0, 7);
const pill = "rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-white/10";

export default function RecentAwardsPage() {
  const [rows, setRows] = useState<ViewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [winner, setWinner] = useState("");
  const [kind, setKind] = useState("전체");
  const [reload, setReload] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [notice, setNotice] = useState("");
  const auth = useAuth();
  const canCollect = auth.profileStatus === "ready" && auth.role === "admin";
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/recent-awards", { cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || "조회 실패"); return body; })
      .then(body => { setRows(body.rows); setError(""); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "조회 실패"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const base = useMemo(() => {
    if (range === "all") return rows;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const cutoff = new Date(`${today}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - range);
    return rows.filter(row => row.award_date >= cutoff.toISOString().slice(0, 10));
  }, [rows, range]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return base.filter(row => (!winner || row.winner_business_no === winner)
      && (kind === "전체" || row.classification === kind)
      && (!term || [row.project, row.winner_name, row.customer, row.bid_no, row.product_brand]
        .join(" ").toLocaleLowerCase().includes(term)));
  }, [base, winner, kind, search]);
  const total = filtered.reduce((sum, row) => sum + row.amount, 0);
  const vendorStats = useMemo(() => {
    const map = new Map<string, { no: string; name: string; count: number; amount: number }>();
    for (const row of filtered) {
      const old = map.get(row.winner_business_no);
      map.set(row.winner_business_no, { no: row.winner_business_no, name: row.winner_name, count: (old?.count ?? 0) + 1, amount: (old?.amount ?? 0) + row.amount });
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [filtered]);
  const monthly = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    for (const row of filtered) {
      const key = monthKey(row.award_date), old = map.get(key);
      map.set(key, { count: (old?.count ?? 0) + 1, amount: (old?.amount ?? 0) + row.amount });
    }
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);
  const largest = Math.max(1, ...vendorStats.map(v => v.amount));
  const monthlyMax = Math.max(1, ...monthly.map(([, v]) => v.amount));
  const latest = filtered[0]?.award_date ?? "-";
  const updated = rows.reduce((max, row) => row.updated_at > max ? row.updated_at : max, "");

  async function collectNow() {
    setCollecting(true); setNotice("");
    try {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date());
      const [year, month] = today.split("-").map(Number);
      const targets = [0, 1].map(offset => new Date(Date.UTC(year, month - 1 - offset, 1)));
      for (const date of targets) {
        const response = await authedFetch("/api/admin/virtualization-candidates", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, group: "core", persist: true, strict: true }),
        });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.errors?.join(" · ") || body.error || "수집 실패");
      }
      setNotice("최근 2개월 낙찰 자료를 갱신했습니다."); setReload(x => x + 1);
    } catch (e) { setNotice(e instanceof Error ? e.message : "수집 실패"); }
    finally { setCollecting(false); }
  }

  function download() {
    const header = ["낙찰일", "공고번호", "사업명", "낙찰업체", "사업자번호", "수요기관", "분류", "사업 전체 낙찰금액(원)", "공고명에 확인된 제조사"];
    const lines = [header, ...filtered.map(row => [row.award_date, row.bid_no, row.project, row.winner_name, row.winner_business_no, row.customer, row.classification === "hci" ? "HCI" : "서버 가상화", row.amount, row.product_brand ?? "미확인"])];
    const csv = "\uFEFF" + lines.map(line => line.map(value => {
      const raw = String(value ?? "");
      const safe = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "최근_가상화_낙찰.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className="min-w-0 flex-1 bg-[#f2f6fc] px-4 py-6 text-slate-900 dark:bg-[#081426] dark:text-white sm:px-6 xl:px-8">
    <div className="mx-auto max-w-[1800px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[.17em] text-blue-600 dark:text-cyan-300">G2B AWARD RADAR</p>
          <h1 className="mt-1 text-2xl font-extrabold">최근 낙찰</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">가상화·HCI 관련 사업의 실제 낙찰업체</p></div>
        <div className="flex items-center gap-2">
          {canCollect && <button type="button" disabled={collecting} className={`${pill} bg-blue-50 text-blue-700 disabled:opacity-40 dark:bg-blue-500/10 dark:text-blue-200`} onClick={() => void collectNow()}>{collecting ? "수집 중…" : "지금 수집"}</button>}
          <button type="button" className={pill} onClick={() => { setLoading(true); setReload(x => x + 1); }}>화면 새로고침</button>
          <button type="button" className={`${pill} bg-blue-600 text-white disabled:opacity-40`} onClick={download} disabled={!filtered.length}>CSV 다운로드</button>
        </div>
      </header>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["낙찰", `${filtered.length.toLocaleString()}건`], ["사업 전체 낙찰금액", compact(total)], ["낙찰업체", `${vendorStats.length.toLocaleString()}곳`], ["최근 낙찰일", latest]].map(([label, value]) =>
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#101f36]"><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-xl font-extrabold tabular-nums text-blue-600 dark:text-cyan-200">{value}</p></div>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#101f36]">
        <div className="flex gap-1">{(["all", 30, 90, 180, 365] as const).map(day => <button key={day} type="button" onClick={() => { setRange(day); setWinner(""); }} className={`${pill} ${range === day ? "border-blue-500 bg-blue-600 text-white" : ""}`}>{day === "all" ? "전체" : `${day}일`}</button>)}</div>
        <input aria-label="사업명, 낙찰업체, 수요기관 검색" placeholder="사업명·낙찰업체·수요기관 검색" value={search} onChange={e => { setSearch(e.target.value); }} className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-white/10" />
        <select aria-label="사업 분류" value={kind} onChange={e => setKind(e.target.value)} className={`${pill} bg-transparent`}><option>전체</option><option value="server_virtualization">서버 가상화</option><option value="hci">HCI</option></select>
        {winner && <button type="button" onClick={() => setWinner("")} className="rounded-lg bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">업체 필터 해제 ×</button>}
      </div>
      {notice && <p role="status" className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">{notice}</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(350px,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#101f36]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-white/10"><h2 className="font-bold">낙찰 원자료 <span className="ml-1 text-blue-600 dark:text-cyan-200">{filtered.length}건</span></h2><span className="text-xs text-slate-500">{range === "all" ? "전체 기간" : `최근 ${range}일`} · 전체 {rows.length}건</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[800px] table-fixed text-left text-sm"><colgroup><col className="w-[90px]"/><col/><col className="w-[145px]"/><col className="w-[125px]"/><col className="w-[130px]"/></colgroup>
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5"><tr><th className="p-3">낙찰일</th><th className="p-3">사업명</th><th className="p-3">낙찰업체</th><th className="p-3">수요기관</th><th className="p-3 text-right">전체 낙찰금액</th></tr></thead>
            <tbody>{filtered.map(row => <tr key={row.external_key} className="border-t border-slate-100 align-top dark:border-white/10">
              <td className="p-3 tabular-nums text-slate-500">{row.award_date.slice(2).replaceAll("-", ".")}</td>
              <td className="p-3"><Link href={`/competitive-analysis/detail?kind=award&key=${encodeURIComponent(row.external_key)}&from=recent`} className="font-semibold leading-5 hover:text-blue-600 hover:underline dark:hover:text-cyan-300">{row.project}</Link><div className="mt-1 text-xs text-slate-500">{row.classification === "hci" ? "HCI" : "서버 가상화"}{row.product_brand && ` · 공고명: ${row.product_brand}`}</div></td>
              <td className="p-3 font-semibold">{row.winner_name}</td><td className="p-3 text-slate-600 dark:text-slate-300">{row.customer}</td>
              <td className="p-3 text-right font-bold tabular-nums text-blue-600 dark:text-cyan-200" title={won(row.amount)}>{compact(row.amount)}</td>
            </tr>)}</tbody></table></div>
          {loading && <p className="p-8 text-center text-sm text-slate-500">낙찰 내역을 불러오는 중입니다.</p>}
          {!loading && !filtered.length && <p className="p-8 text-center text-sm text-slate-500">해당 조건의 낙찰 건이 없습니다.</p>}
        </section>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#101f36]"><h2 className="font-bold">월별 낙찰 추이</h2><div className="mt-4 space-y-3">{monthly.map(([month, value]) => <div key={month} className="grid grid-cols-[55px_1fr_85px] items-center gap-2 text-xs"><span className="tabular-nums text-slate-500">{month.slice(2)}</span><div className="h-5 overflow-hidden rounded bg-slate-100 dark:bg-white/10"><div className="h-full rounded bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${value.amount / monthlyMax * 100}%` }} /></div><span className="text-right font-bold tabular-nums">{compact(value.amount)}</span></div>)}</div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#101f36]"><div className="flex items-center justify-between"><h2 className="font-bold">낙찰업체별 합계</h2><span className="text-xs text-slate-500">금액순</span></div><div className="mt-3 space-y-1">{vendorStats.slice(0, 12).map((v, index) => <button type="button" key={v.no} onClick={() => setWinner(winner === v.no ? "" : v.no)} className={`w-full rounded-lg p-2 text-left hover:bg-slate-50 dark:hover:bg-white/5 ${winner === v.no ? "bg-blue-50 dark:bg-blue-500/10" : ""}`}><div className="flex items-baseline justify-between gap-2 text-sm"><span className="min-w-0 truncate"><span className="mr-2 text-xs text-slate-400">{index + 1}</span><strong>{v.name}</strong></span><span className="shrink-0 font-bold tabular-nums text-blue-600 dark:text-cyan-200">{compact(v.amount)}</span></div><div className="mt-1.5 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-white/10"><div className="h-full rounded bg-blue-500" style={{ width: `${v.amount / largest * 100}%` }}/></div><span className="text-xs tabular-nums text-slate-500">{v.count}건</span></div></button>)}</div></section>
          <p className="px-1 text-xs leading-5 text-slate-500">나라장터 최종 낙찰업체 기준 · 금액은 사업 전체 낙찰금액 · 제조사는 공고명에 명시된 경우만 표시<br/>최근 저장 자료 {updated ? new Date(updated).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-"}</p>
        </aside>
      </div>
    </div>
  </main>;
}
