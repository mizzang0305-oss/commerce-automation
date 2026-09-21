"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SheetSetting } from "@/lib/google-sheets/sheetSchemas";

export function SettingsEditor({ settings }: { settings: SheetSetting[] }) {
  const router = useRouter();
  const initial = Object.fromEntries(settings.map((setting) => [setting.name, setting.value]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [message, setMessage] = useState("");
  async function save() {
    const updates = Object.fromEntries(Object.entries(values).filter(([key, value]) => initial[key] !== value));
    const response = await fetch("/api/commerce-control/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected: initial, updates }) });
    const body = await response.json() as { message?: string };
    setMessage(response.ok ? "설정을 저장했습니다." : body.message || "저장 실패");
    if (response.ok) router.refresh();
  }
  const locked = new Set(["업로드 방식", "비공개 자동 업로드", "공개 자동 업로드"]);
  return <div className="rounded-3xl border border-slate-200 bg-white p-5"><div className="grid gap-4 sm:grid-cols-2">{settings.map((setting) => <label key={setting.name} className="text-sm font-black">{setting.name}<input disabled={locked.has(setting.name)} value={values[setting.name]} onChange={(event) => setValues({ ...values, [setting.name]: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal disabled:bg-slate-100 disabled:text-slate-500" /><span className="mt-1 block text-xs font-normal text-slate-500">{locked.has(setting.name) ? "MVP 고정 안전값 · 변경 불가" : setting.description}</span></label>)}</div><button type="button" onClick={save} className="mt-5 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white">설정 저장</button>{message ? <p className="mt-3 text-sm font-semibold">{message}</p> : null}</div>;
}
