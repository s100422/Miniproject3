"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getAnonymousId } from "@/lib/anonymousId";

type PlanSummary = {
  id: string;
  created_at: string;
  name: string | null;
  target_monthly_dividend: number;
  monthly_investment: number;
};

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: session } = await supabase.auth.getSession();
    const query = supabase
      .from("plans")
      .select("id, created_at, name, target_monthly_dividend, monthly_investment")
      .order("created_at", { ascending: false });

    const { data } = session.session
      ? await query.eq("user_id", session.session.user.id)
      : await query.eq("anonymous_id", getAnonymousId());

    setPlans(data ?? []);
  }

  function startRename(p: PlanSummary) {
    setRenamingId(p.id);
    setNameInput(p.name ?? "");
  }

  async function saveRename(id: string) {
    const trimmed = nameInput.trim();
    await supabase.from("plans").update({ name: trimmed || null }).eq("id", id);
    setPlans((prev) => prev?.map((p) => (p.id === id ? { ...p, name: trimmed || null } : p)) ?? null);
    setRenamingId(null);
  }

  async function deletePlan(id: string) {
    if (!confirm("이 플랜을 삭제할까요?")) return;
    await supabase.from("plans").delete().eq("id", id);
    setPlans((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">저장된 플랜</h1>
        <Link href="/plan" className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">
          + 새 플랜 만들기
        </Link>
      </div>

      {plans === null && <p className="mt-4 text-slate-500">불러오는 중...</p>}
      {plans?.length === 0 && <p className="mt-4 text-slate-600">아직 저장된 플랜이 없어요.</p>}

      <div className="mt-6 space-y-3">
        {plans?.map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-200 p-4 hover:border-emerald-600">
            <div className="flex items-start justify-between gap-3">
              {renamingId === p.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="플랜 이름"
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => saveRename(p.id)}
                    className="text-sm text-emerald-700 underline"
                  >
                    저장
                  </button>
                </div>
              ) : (
                <Link href={`/plans/${p.id}`} className="flex-1">
                  <p className="font-medium text-slate-900">
                    {p.name || `목표 월 $${p.target_monthly_dividend}`}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    목표 월 ${p.target_monthly_dividend} · 월 ${p.monthly_investment} 투자
                  </p>
                </Link>
              )}

              <div className="flex shrink-0 gap-2 text-xs">
                {renamingId !== p.id && (
                  <button
                    type="button"
                    onClick={() => startRename(p)}
                    className="text-slate-400 underline"
                  >
                    이름 변경
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deletePlan(p.id)}
                  className="text-red-500 underline"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
