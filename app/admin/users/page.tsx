"use client";

import { useEffect, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import { authedFetch } from "@/lib/authedFetch";

type UserRow = { id: string; email: string; name: string; department: string; role: "admin" | "user"; created_at: string | null; last_sign_in_at: string | null; isCurrent: boolean };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true); setMessage(null);
    try {
      const res = await authedFetch("/api/admin/users", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? "사용자 조회 실패");
      setUsers(body.users ?? []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "사용자 조회 실패");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function changeRole(user: UserRow, role: "admin" | "user") {
    setMessage(null);
    const res = await authedFetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: user.id, role }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) { setMessage(body.error ?? "권한 변경 실패"); return; }
    setUsers((prev) => prev.map((row) => row.id === user.id ? { ...row, role } : row));
    setMessage(`${user.email} 권한을 ${role}로 변경했습니다.`);
  }

  return (
    <AdminGuard>
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">사용자 관리</h1>
        <p className="mt-1 text-sm text-slate-500">로그인 계정과 role을 관리합니다. 본인 admin 권한은 실수로 해제되지 않도록 보호됩니다.</p>
        {message && <div className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{message}</div>}
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/70">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] text-slate-500 dark:bg-slate-800/40"><tr><th className="px-4 py-3">계정</th><th className="px-4 py-3">이름/부서</th><th className="px-4 py-3">최근 로그인</th><th className="px-4 py-3">권한</th></tr></thead>
              <tbody>
                {users.map((user) => <tr key={user.id} className="border-t border-slate-100 dark:border-white/5">
                  <td className="px-4 py-3"><p className="font-semibold text-slate-900 dark:text-white">{user.email}</p>{user.isCurrent && <p className="text-[10px] text-cyan-600 dark:text-cyan-300">현재 로그인</p>}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{[user.name,user.department].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("ko-KR") : "-"}</td>
                  <td className="px-4 py-3"><select value={user.role} disabled={user.isCurrent} onChange={(e) => void changeRole(user, e.target.value as "admin" | "user")} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold dark:border-white/10 dark:bg-slate-900"><option value="user">user</option><option value="admin">admin</option></select></td>
                </tr>)}
                {!loading && users.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">사용자가 없습니다.</td></tr>}
                {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">불러오는 중…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
