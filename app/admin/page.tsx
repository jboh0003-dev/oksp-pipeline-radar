"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import { authedFetch } from "@/lib/authedFetch";

type StatusBody = {
  ok: boolean;
  environment?: { missing: string[]; g2bConfigured: boolean; cronConfigured: boolean; supabaseAdminConfigured: boolean };
  notices?: { active: number; contrabass: number; viola: number };
  users?: { total: number; admins: number };
  keywords?: { enabled: number; contrabass: number; viola: number; exclude: number };
  recentRuns?: Array<{
    id: string;
    source: string | null;
    mode: string | null;
    finished_at: string | null;
    ok: boolean;
    fetched_count: number | null;
    matched_count: number | null;
    inserted_count: number | null;
    updated_count: number | null;
    message: string | null;
  }>;
  error?: string;
};

export default function AdminHomePage() {
  const [data, setData] = useState<StatusBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await authedFetch("/api/admin/status", { cache: "no-store" });
    const body = (await res.json()) as StatusBody;
    if (!res.ok || !body.ok) {
      setError(body.error ?? "운영 상태 조회 실패");
      return;
    }
    setData(body);
  }

  useEffect(() => { void load(); }, []);

  return (
    <AdminGuard>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        <header className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-300">Pipeline Maker · 관리자</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">관리자 설정</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">수집 상태, 키워드, 사용자, 환경설정을 한 화면에서 점검합니다.</p>
            </div>
            <button onClick={() => void load()} className="h-9 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white dark:bg-slate-700">새로고침</button>
          </div>
        </header>

        {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card label="진행 중 공고" value={data?.notices?.active ?? null} note={data ? `CONTRABASS ${data.notices?.contrabass ?? 0} · VIOLA ${data.notices?.viola ?? 0}` : "조회 중"} />
          <Card label="활성 키워드" value={data?.keywords?.enabled ?? null} note={data ? `CB ${data.keywords?.contrabass ?? 0} · VIOLA ${data.keywords?.viola ?? 0} · 제외 ${data.keywords?.exclude ?? 0}` : "조회 중"} />
          <Card label="사용자" value={data?.users?.total ?? null} note={data ? `관리자 ${data.users?.admins ?? 0}명` : "조회 중"} />
          <Card label="환경설정" value={data ? (data.environment?.missing.length ? data.environment.missing.length : 0) : null} note={data?.environment?.missing.length ? `누락: ${data.environment.missing.join(", ")}` : "필수 환경변수 정상"} />
        </section>

        <section className="mt-5 grid gap-3 lg:grid-cols-3">
          <AdminLink href="/admin/users" title="사용자 관리" desc="계정 목록 확인 및 admin/user 권한 변경" />
          <AdminLink href="/admin/keywords" title="키워드 규칙" desc="실제 자동수집에 적용되는 CONTRABASS·VIOLA·제외 키워드 관리" />
          <AdminLink href="/admin/collection-reset" title="수집 상태 초기화" desc="브라우저 공고 캐시와 신규 표시 snapshot 초기화" />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">최근 수집 실행</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
                <tr><th className="px-4 py-3">완료시각</th><th className="px-4 py-3">구분</th><th className="px-4 py-3">상태</th><th className="px-4 py-3 text-right">조회</th><th className="px-4 py-3 text-right">매칭</th><th className="px-4 py-3 text-right">신규</th><th className="px-4 py-3 text-right">업데이트</th></tr>
              </thead>
              <tbody>
                {(data?.recentRuns ?? []).map((run) => (
                  <tr key={run.id} className="border-t border-slate-100 dark:border-white/5">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{run.finished_at ? new Date(run.finished_at).toLocaleString("ko-KR") : "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">{run.message || run.source || "-"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${run.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"}`}>{run.ok ? "정상" : "오류"}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">{run.fetched_count ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{run.matched_count ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{run.inserted_count ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{run.updated_count ?? 0}</td>
                  </tr>
                ))}
                {data && !(data.recentRuns?.length) && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">수집 이력이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminGuard>
  );
}

function Card({ label, value, note }: { label: string; value: number | null; note: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-300">{value == null ? "-" : value.toLocaleString("ko-KR")}</p><p className="mt-1 truncate text-[11px] text-slate-400">{note}</p></div>;
}

function AdminLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow dark:border-white/10 dark:bg-slate-900/70"><p className="font-bold text-slate-900 dark:text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{desc}</p></Link>;
}
