"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, type FormEvent } from "react";
import AdminGuard from "@/components/AdminGuard";
import { authedFetch } from "@/lib/authedFetch";

type UserRow = { id: string; email: string; name: string; department: string; role: "admin" | "user"; created_at: string | null; last_sign_in_at: string | null; isCurrent: boolean };
type Notice = { kind: "success" | "error"; text: string };
const field = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-white";
const primary = "h-10 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [creating, setCreating] = useState(false);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await authedFetch("/api/admin/users", { cache: "no-store" });
      const body = (await res.json()) as { ok: boolean; users?: UserRow[]; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "계정 조회 실패");
      setUsers(body.users ?? []);
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "계정 조회 실패" });
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function createAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    if (password !== confirm) return setNotice({ kind: "error", text: "비밀번호 확인이 일치하지 않습니다." });
    if (password.length < 10 || password.length > 128) return setNotice({ kind: "error", text: "비밀번호는 10~128자로 설정해 주세요." });
    setCreating(true);
    try {
      const res = await authedFetch("/api/admin/users", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "계정 생성 실패");
      const createdEmail = email.trim();
      setEmail(""); setPassword(""); setConfirm("");
      await load();
      setNotice({ kind: "success", text: createdEmail + " 계정을 생성했습니다. 초기 비밀번호로 즉시 로그인할 수 있습니다." });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "계정 생성 실패" });
    } finally { setCreating(false); }
  }

  async function changeRole(user: UserRow, role: "admin" | "user") {
    setNotice(null); setRoleBusy(user.id);
    try {
      const res = await authedFetch("/api/admin/users", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, role }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "권한 변경 실패");
      setUsers((prev) => prev.map((item) => item.id === user.id ? { ...item, role } : item));
      setNotice({ kind: "success", text: user.email + " 계정의 권한을 변경했습니다." });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "권한 변경 실패" });
    } finally { setRoleBusy(null); }
  }

  function toggleReset(id: string) {
    setResetId((prev) => prev === id ? null : id);
    setResetPassword(""); setResetConfirm(""); setNotice(null);
  }
  async function resetUserPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetId) return;
    if (resetPassword !== resetConfirm) return setNotice({ kind: "error", text: "새 비밀번호 확인이 일치하지 않습니다." });
    if (resetPassword.length < 10 || resetPassword.length > 128) return setNotice({ kind: "error", text: "비밀번호는 10~128자로 설정해 주세요." });
    setResetting(true); setNotice(null);
    try {
      const res = await authedFetch("/api/admin/users/reset-password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: resetId, password: resetPassword }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "비밀번호 변경 실패");
      const target = users.find((item) => item.id === resetId)?.email ?? "사용자";
      setResetId(null); setResetPassword(""); setResetConfirm("");
      setNotice({ kind: "success", text: target + " 계정의 비밀번호를 변경했습니다." });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "비밀번호 변경 실패" });
    } finally { setResetting(false); }
  }

  return (
    <AdminGuard>
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">계정 관리</h1>
            <p className="mt-1 text-sm text-slate-500">이메일과 비밀번호로 계정을 생성하고 접근 권한을 관리합니다.</p></div>
          <Link href="/account/password" className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200">내 비밀번호 변경</Link>
        </div>

        {notice && <div role="status" className={notice.kind === "error"
          ? "mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"
          : "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200"}>{notice.text}</div>}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">신규 계정 생성</h2>
          <p className="mt-1 text-xs text-slate-500">등록 즉시 로그인할 수 있으며, 최초 권한은 일반 사용자입니다.</p>
          <form onSubmit={createAccount} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">이메일</span>
              <input className={field} type="email" autoComplete="off" placeholder="user@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} disabled={creating} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">초기 비밀번호</span>
              <input className={field} type="password" autoComplete="new-password" placeholder="10자 이상" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} maxLength={128} disabled={creating} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">비밀번호 확인</span>
              <input className={field} type="password" autoComplete="new-password" placeholder="한 번 더 입력" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} maxLength={128} disabled={creating} /></label>
            <button type="submit" className={primary} disabled={creating}>{creating ? "생성 중…" : "계정 생성"}</button>
          </form>
          <p className="mt-3 text-[11px] text-slate-500">초기 비밀번호는 해당 사용자에게 별도로 전달해 주세요. 비밀번호 원문은 저장하거나 목록에 표시하지 않습니다.</p>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">등록 계정 <span className="ml-1 text-sm font-medium text-slate-500">{users.length}명</span></h2>
            <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300">새로고침</button>
          </div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] text-slate-500 dark:bg-slate-800/40">
              <tr><th className="px-4 py-3">이메일</th><th className="px-4 py-3">이름 / 부서</th><th className="px-4 py-3">최근 로그인</th><th className="px-4 py-3">권한</th><th className="px-4 py-3">비밀번호</th></tr>
            </thead>
            <tbody>
              {users.map((user) => <Fragment key={user.id}>
                <tr className="border-t border-slate-100 dark:border-white/5">
                  <td className="px-4 py-3"><p className="font-semibold text-slate-900 dark:text-white">{user.email}</p>{user.isCurrent && <p className="mt-1 text-[10px] text-blue-600 dark:text-blue-300">현재 로그인</p>}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{[user.name, user.department].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("ko-KR") : "-"}</td>
                  <td className="px-4 py-3"><select aria-label={user.email + " 권한"} value={user.role} disabled={user.isCurrent || roleBusy !== null} onChange={(e) => void changeRole(user, e.target.value as "admin" | "user")} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold dark:border-white/10 dark:bg-slate-900 dark:text-white">
                    <option value="user">일반 사용자</option><option value="admin">관리자</option>
                  </select></td>
                  <td className="px-4 py-3">{user.isCurrent
                    ? <Link href="/account/password" className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-300">내 비밀번호 변경</Link>
                    : <button type="button" onClick={() => toggleReset(user.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200">{resetId === user.id ? "취소" : "비밀번호 초기화"}</button>}
                  </td>
                </tr>
                {resetId === user.id && <tr className="bg-slate-50/80 dark:bg-slate-800/30"><td colSpan={5} className="px-4 py-4">
                  <form onSubmit={resetUserPassword} className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-500/20 dark:bg-slate-900">
                    <p className="mb-3 text-sm font-bold text-slate-900 dark:text-white">{user.email} · 새 비밀번호 설정</p>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                      <label className="block"><span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">새 비밀번호 (10자 이상)</span><input type="password" autoComplete="new-password" className={field} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} minLength={10} maxLength={128} required disabled={resetting} /></label>
                      <label className="block"><span className="mb-1 block text-xs text-slate-600 dark:text-slate-300">새 비밀번호 확인</span><input type="password" autoComplete="new-password" className={field} value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} minLength={10} maxLength={128} required disabled={resetting} /></label>
                      <button type="submit" className={primary} disabled={resetting}>{resetting ? "변경 중…" : "비밀번호 변경"}</button>
                    </div>
                  </form>
                </td></tr>}
              </Fragment>)}
              {!loading && users.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">등록된 계정이 없습니다.</td></tr>}
              {loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">불러오는 중…</td></tr>}
            </tbody>
          </table></div>
        </section>
      </div>
    </AdminGuard>
  );
}
