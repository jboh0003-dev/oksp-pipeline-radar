"use client";

import { useEffect, useMemo, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { authedFetch } from "@/lib/authedFetch";

type Rule = { id: string; rule_type: "product" | "exclude"; product: string; keyword: string; enabled: boolean };

export default function AdminKeywordsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [product, setProduct] = useState("CONTRABASS");
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await authedFetch("/api/admin/keywords", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok || !body.ok) { setMessage(body.error ?? "키워드 조회 실패"); return; }
    setRules(body.rules ?? []);
  }
  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => ({
    CONTRABASS: rules.filter((r) => r.rule_type === "product" && r.product === "CONTRABASS"),
    VIOLA: rules.filter((r) => r.rule_type === "product" && r.product === "VIOLA"),
    EXCLUDE: rules.filter((r) => r.rule_type === "exclude"),
  }), [rules]);

  async function add() {
    const value = keyword.trim();
    if (!value) return;
    const isExclude = product === "EXCLUDE";
    const res = await authedFetch("/api/admin/keywords", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ruleType: isExclude ? "exclude" : "product", product: isExclude ? "" : product, keyword: value }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) { setMessage(body.error ?? "추가 실패"); return; }
    setKeyword(""); setMessage(`'${value}' 규칙을 저장했습니다. 다음 자동수집부터 적용됩니다.`); await load();
  }

  async function toggle(rule: Rule) {
    const res = await authedFetch("/api/admin/keywords", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }) });
    const body = await res.json();
    if (!res.ok || !body.ok) { setMessage(body.error ?? "변경 실패"); return; }
    setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
  }

  async function remove(rule: Rule) {
    if (!window.confirm(`'${rule.keyword}' 규칙을 삭제할까요?`)) return;
    const res = await authedFetch(`/api/admin/keywords?id=${encodeURIComponent(rule.id)}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok || !body.ok) { setMessage(body.error ?? "삭제 실패"); return; }
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
  }

  return (
    <AdminGuard>
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">키워드 규칙</h1>
        <p className="mt-1 text-sm text-slate-500">여기서 켜고 끄거나 추가한 키워드는 <strong>실제 나라장터 자동수집 로직에 다음 실행부터 바로 적용</strong>됩니다.</p>

        <div className="mt-5 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70 sm:flex-row">
          <select value={product} onChange={(e) => setProduct(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-white/10 dark:bg-slate-900"><option>CONTRABASS</option><option>VIOLA</option><option value="EXCLUDE">제외 키워드</option></select>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="추가할 키워드" className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900" />
          <button onClick={() => void add()} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">추가</button>
        </div>
        {message && <p className="mt-3 text-xs text-slate-500">{message}</p>}

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <RuleGroup title="CONTRABASS" rules={grouped.CONTRABASS} onToggle={toggle} onRemove={remove} />
          <RuleGroup title="VIOLA" rules={grouped.VIOLA} onToggle={toggle} onRemove={remove} />
          <RuleGroup title="제외 키워드" rules={grouped.EXCLUDE} onToggle={toggle} onRemove={remove} />
        </div>
      </div>
    </AdminGuard>
  );
}

function RuleGroup({ title, rules, onToggle, onRemove }: { title: string; rules: Rule[]; onToggle: (r: Rule) => void; onRemove: (r: Rule) => void }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{title}</h2><span className="text-xs text-slate-400">{rules.filter((r)=>r.enabled).length}/{rules.length} 활성</span></div><div className="flex flex-wrap gap-2">{rules.map((rule)=><div key={rule.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${rule.enabled ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200" : "border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-slate-800"}`}><button onClick={()=>void onToggle(rule)} className="font-semibold">{rule.keyword}</button><button onClick={()=>void onRemove(rule)} aria-label="삭제" className="ml-1 opacity-50 hover:opacity-100">×</button></div>)}</div></section>;
}
