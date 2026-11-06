"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authedFetch } from "@/lib/authedFetch";

const field = "mt-1 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-white";

export default function AccountPasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    if (newPassword !== confirmPassword) return setNotice({ kind: "error", text: "새 비밀번호 확인이 일치하지 않습니다." });
    if (newPassword.length < 10 || newPassword.length > 128) return setNotice({ kind: "error", text: "새 비밀번호는 10~128자로 설정해 주세요." });
    setSubmitting(true);
    try {
      const res = await authedFetch("/api/account/password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "비밀번호 변경 실패");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setNotice({ kind: "success", text: "비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용해 주세요." });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "비밀번호 변경 실패" });
    } finally { setSubmitting(false); }
  }

  return <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">내 비밀번호 변경</h1><p className="mt-1 text-sm text-slate-500">현재 비밀번호 확인 후 새 비밀번호로 변경합니다.</p></div>
      <Link href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200">돌아가기</Link>
    </div>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
      {notice && <p role="status" className={notice.kind === "error"
        ? "mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"
        : "mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"}>{notice.text}</p>}
      <form onSubmit={submit} className="space-y-4">
        <label className="block"><span className="text-xs font-semibold text-slate-600 dark:text-slate-300">현재 비밀번호</span><input className={field} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required disabled={submitting} /></label>
        <label className="block"><span className="text-xs font-semibold text-slate-600 dark:text-slate-300">새 비밀번호 (10자 이상)</span><input className={field} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={10} maxLength={128} required disabled={submitting} /></label>
        <label className="block"><span className="text-xs font-semibold text-slate-600 dark:text-slate-300">새 비밀번호 확인</span><input className={field} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={10} maxLength={128} required disabled={submitting} /></label>
        <button type="submit" disabled={submitting} className="h-11 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500">{submitting ? "변경 중…" : "비밀번호 변경"}</button>
      </form>
    </section>
  </div>;
}
