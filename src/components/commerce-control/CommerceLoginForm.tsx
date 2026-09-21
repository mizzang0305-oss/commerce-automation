"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CommerceLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/commerce-control/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password })
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) { setMessage(result.message || "로그인에 실패했습니다."); return; }
      router.replace("/commerce-control"); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-16 max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60">
      <p className="text-xs font-bold tracking-[0.2em] text-emerald-700">OWNER ACCESS</p>
      <h1 className="mt-2 text-2xl font-black">Commerce Control 로그인</h1>
      <p className="mt-2 text-sm text-slate-500">단일 운영자 세션입니다. 비밀번호는 브라우저 저장소에 보관하지 않습니다.</p>
      <input type="hidden" name="username" autoComplete="username" value="owner" readOnly />
      <label className="mt-6 block text-sm font-bold" htmlFor="control-password">운영자 비밀번호</label>
      <input id="control-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-600" />
      {message ? <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{message}</p> : null}
      <button disabled={busy} className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-50">
        {busy ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
