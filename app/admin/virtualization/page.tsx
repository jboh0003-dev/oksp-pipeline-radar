"use client";
import { useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { authedFetch } from "@/lib/authedFetch";

const KEYWORDS = ["가상화", "에이블스택", "ABLESTACK", "하이퍼바이저", "HCI", "VMware", "vSphere", "OpenStack", "오픈스택", "CONTRABASS", "VIOLA", "클라우드잇"];
type Result = { ok: boolean; year?: number; month?: number; keyword?: string; requests?: number; fetched?: number; reportedTotal?: number; matched?: number; saved?: number; error?: string; rows?: Array<{product_name:string;brand:string|null; supplier_name:string|null; customer_name:string|null; amount:number|null}> };
export default function VirtualizationBackfillPage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(1);
  const [keyword, setKeyword] = useState(KEYWORDS[0]);
  const [busy, setBusy] = useState(false);
  const [awardResult, setAwardResult] = useState<Record<string, unknown> | null>(null);
  const [candidateResult, setCandidateResult] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  async function run(save: boolean) {
    setBusy(true); setResult(null);
    try {
      const params = { year, month, keyword };
      const url = "/api/admin/virtualization-backfill";
      const response = await authedFetch(save ? url : url + "?" + new URLSearchParams(Object.fromEntries(Object.entries(params).map(([key,value]) => [key,String(value)]))).toString(),
        save ? { method:"POST", headers: { "Content-Type":"application/json" }, body:JSON.stringify(params) } : { cache:"no-store" });
      const value: Result = await response.json();
      if (!response.ok || !value.ok) throw new Error(value.error ?? "조회에 실패했습니다.");
      if (save) { setResult(value); setPreview(null); } else setPreview(value);
    } catch (error) {
      setResult({ok:false,error:error instanceof Error ? error.message : String(error)});
    } finally {setBusy(false);}
  }
  async function runAwards(persist: boolean) {
    setBusy(true); setAwardResult(null);
    try {
      const res = await authedFetch("/api/admin/competitive-awards-backfill", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, persist }),
      });
      const body: Record<string, unknown> = await res.json();
      setAwardResult(body);
    } catch (error) {
      setAwardResult({ok:false,error:error instanceof Error?error.message:String(error)});
    } finally {setBusy(false);}
  }
  async function runCandidates(persist: boolean) {
    setBusy(true);
    setCandidateResult(null);
    try {
      const res = await authedFetch("/api/admin/virtualization-candidates", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({year, month, persist}),
      });
      const body: Record<string, unknown> = await res.json();
      setCandidateResult(body);
    } catch (error) {
      setCandidateResult({ok:false,error:error instanceof Error?error.message:String(error)});
    } finally {setBusy(false);}
  }
  return <AdminGuard><div className="mx-auto max-w-6xl px-5 py-6">
    <p className="text-xs font-semibold text-blue-600">Pipeline Maker · 관리자 전용</p>
    <h1 className="mt-1 text-2xl font-bold">2024~2026년 가상화 제품 조달 납품수집</h1>
    <p className="mt-2 text-sm text-slate-500">수동으로 한 달·한 제품씩 나라장터 쇼핑몰 납품요구 상세를 조회합니다. 자동 수집은 실행하지 않습니다. 원본 낙찰정보와 분리 저장합니다.</p>
    <section className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <label className="flex flex-col gap-1 text-xs">연도<select className="rounded-md border px-3 py-2 text-sm dark:bg-slate-900" value={year} onChange={e=>{setYear(Number(e.target.value));setPreview(null)}}>{[2024,2025,2026].map(y=><option key={y}>{y}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">월<select className="rounded-md border px-3 py-2 text-sm dark:bg-slate-900" value={month} onChange={e=>{setMonth(Number(e.target.value));setPreview(null)}}>{Array.from({length:year===2026?10:12},(_,i)=>i+1).map(m=><option key={m}>{m}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">제품 검색어<select className="rounded-md border px-3 py-2 text-sm dark:bg-slate-900" value={keyword} onChange={e=>{setKeyword(e.target.value);setPreview(null)}}>{KEYWORDS.map(k=><option key={k}>{k}</option>)}</select></label>
      <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={()=>void run(false)}>{busy?"조회 중":"API 미리보기"}</button>
      <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !preview?.ok} onClick={()=>void run(true)}>검증된 건만 저장</button>
    </section>
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <h2 className="font-semibold">동일 기간의 나라장터 낙찰이력 재수집</h2>
      <p className="mt-1 text-xs text-slate-500">상단에서 선택한 연도·월에 대해 기존 4개 추적업체의 물품·용역·공사·외자 낙찰정보를 조회합니다. 다른 달은 별도 실행하며, 매일 자동 실행하지 않습니다.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={busy} onClick={()=>void runAwards(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">낙찰정보 조회(미리보기)</button>
        <button disabled={busy || awardResult?.ok !== true} onClick={()=>void runAwards(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">낙찰정보 수집·저장</button>
      </div>
      {awardResult && <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">상태: {String(awardResult.ok)} · 원천 {String(awardResult.fetchedCount ?? "-")}건 · 검증 {String(awardResult.dedupedCount ?? "-")}건 · 신규 {String(awardResult.insertedCount ?? "-")}건 · 오류 {JSON.stringify(awardResult.errors ?? awardResult.error ?? "-")}</p>}
    </section>
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <h2 className="font-semibold">가상화·HCI 낙찰업체 발굴 (SI·총판 포함)</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">선택한 월의 개찰정보에서 가상화·HCI 등 제품/사업 키워드로 낙찰건을 찾습니다. 낙찰업체와 제조사를 별도 표시하며, 제조사가 공고명에 없으면 "미확인"으로 남깁니다.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void runCandidates(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">가상화 낙찰 검색</button>
        <button disabled={busy || candidateResult?.ok !== true} onClick={() => void runCandidates(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">검색 결과 DB 저장</button>
      </div>
      {candidateResult && <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">상태: {String(candidateResult.ok)} · 원천 {String(candidateResult.fetchedCount ?? "-")}건 · 고유 {String(candidateResult.matchedCount ?? "-")}건 · 제조사 명시 {String(candidateResult.withNamedBrand ?? "-")}건 · 신규 {String(candidateResult.insertedCount ?? "-")}건 · 오류 {JSON.stringify(candidateResult.errors ?? candidateResult.error ?? "-")}</p>}
    </section>
    <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
      조달쇼핑몰 납품요구 상세 API는 현재 서비스키로 정상 조회가 확인됐습니다. 월별 제품 납품요구는 가상화 키워드로 조회 후 제조사·제품명으로 분류합니다.
    </section>
    {result && <p className={`mt-4 rounded-lg p-4 text-sm ${result.ok?"bg-slate-100 dark:bg-slate-800":"bg-rose-50 text-rose-700"}`}>{result.ok?`수집 요청 ${result.requests}회 · 원천 ${result.fetched}건 · 매칭 ${result.matched}건 · 저장 요청 ${result.saved}건`:result.error}</p>}
    {preview && <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <h2 className="font-semibold">미리보기 · 원천 {preview.fetched}건 / 가상화 제품 매칭 {preview.matched}건</h2>
      <p className="mt-1 text-xs text-slate-500">표시는 최대 30건입니다. 원천 API가 비정상 응답하면 DB에 쓰지 않습니다. 수집 품질이 검증된 건에 한해 저장하세요.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">제품명</th><th className="p-2">브랜드</th><th className="p-2">업체</th><th className="p-2">수요기관</th><th className="p-2 text-right">금액</th></tr></thead>
      <tbody>{(preview.rows??[]).map((row,i)=><tr key={i} className="border-t"><td className="p-2">{row.product_name}</td><td className="p-2">{row.brand??"-"}</td><td className="p-2">{row.supplier_name??"-"}</td><td className="p-2">{row.customer_name??"-"}</td><td className="p-2 text-right">{row.amount?.toLocaleString("ko-KR")??"-"}</td></tr>)}</tbody></table></div>
    </section>}
  </div></AdminGuard>;
}
