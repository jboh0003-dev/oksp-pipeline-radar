"use client";

import { useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { clearAllLocalCache, clearBidLocalCache, clearPreSpecLocalCache } from "@/lib/cacheReset";

export default function AdminCollectionResetPage() {
  const [message, setMessage] = useState<string | null>(null);

  function run(kind: "bid" | "pre" | "all") {
    const label = kind === "bid" ? "입찰공고" : kind === "pre" ? "사전규격공고" : "전체";
    if (!window.confirm(`${label} 화면 캐시와 신규 표시 기준(snapshot)을 초기화할까요? DB 원본 데이터는 삭제되지 않습니다.`)) return;
    if (kind === "bid") clearBidLocalCache();
    else if (kind === "pre") clearPreSpecLocalCache();
    else clearAllLocalCache();
    setMessage(`${label} 캐시/snapshot을 초기화했습니다. 다음 화면 진입 시 DB에서 다시 불러옵니다.`);
  }

  return (
    <AdminGuard>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">수집 상태 초기화</h1>
        <p className="mt-1 text-sm text-slate-500">화면에 저장된 캐시와 ‘신규’ 판정 기준만 초기화합니다. 나라장터 원본 DB와 과거 수집 이력은 삭제하지 않습니다.</p>
        {message && <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</div>}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <ResetCard title="입찰공고 초기화" desc="입찰 목록 캐시, 마지막 조회시각, 신규 snapshot 초기화" onClick={()=>run("bid")} />
          <ResetCard title="사전규격 초기화" desc="사전규격 캐시, 마지막 조회시각, 신규 snapshot 초기화" onClick={()=>run("pre")} />
          <ResetCard title="전체 초기화" desc="입찰공고 + 사전규격의 브라우저 캐시/snapshot 동시 초기화" danger onClick={()=>run("all")} />
        </div>
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200"><strong>주의:</strong> 이 기능은 브라우저 표시 상태 복구용입니다. 수집 데이터 자체를 지우는 기능은 넣지 않았습니다. 운영 DB 삭제는 실수 위험이 커 별도 기능으로 분리하는 것이 안전합니다.</div>
      </div>
    </AdminGuard>
  );
}

function ResetCard({ title, desc, onClick, danger = false }: { title: string; desc: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 ${danger ? "border-rose-200 bg-rose-50 dark:border-rose-400/20 dark:bg-rose-500/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70"}`}><p className="font-bold text-slate-900 dark:text-white">{title}</p><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{desc}</p></button>;
}
