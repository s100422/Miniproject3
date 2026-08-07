"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DividendChart from "@/components/DividendChart";
import PlanBuilder from "@/components/PlanBuilder";
import type { YearlyProjection } from "@/lib/dividendCalc";

type Plan = {
  id: string;
  name: string | null;
  target_monthly_dividend: number;
  monthly_investment: number;
  allocations: {
    ticker: string;
    weight_pct: number;
    name: string;
    sector: string;
    business_summary: string;
  }[];
  chart_data: YearlyProjection[];
  advice_text: string;
  goal_achieved: boolean;
};

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("plans").select("*").eq("id", params.id).single();
      if (!data) {
        setNotFound(true);
        return;
      }
      setPlan(data);
      setNameInput(data.name ?? "");
    }
    load();
  }, [params.id]);

  async function saveName() {
    if (!plan) return;
    const trimmed = nameInput.trim();
    await supabase.from("plans").update({ name: trimmed || null }).eq("id", plan.id);
    setPlan({ ...plan, name: trimmed || null });
    setEditingName(false);
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-slate-600">플랜을 찾을 수 없어요.</p>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-slate-500">불러오는 중...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {editingName ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="플랜 이름"
            className="rounded border border-slate-300 px-2 py-1 text-2xl font-semibold text-slate-900"
            autoFocus
          />
          <button type="button" onClick={saveName} className="text-sm text-emerald-700 underline">
            저장
          </button>
        </div>
      ) : (
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          {plan.name || "플랜 상세"}
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="text-sm font-normal text-slate-400 underline"
          >
            이름 변경
          </button>
        </h1>
      )}

      {!plan.goal_achieved && (
        <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
          목표에 근접한 대안입니다
        </span>
      )}
      <p className="mt-2 text-slate-600">
        목표 월 ${plan.target_monthly_dividend} · 월 ${plan.monthly_investment} 투자
      </p>

      <div className="mt-4 space-y-2">
        {plan.allocations.map((a) => (
          <div key={a.ticker} className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2">
            <div>
              <p className="text-sm font-medium text-slate-800">
                {a.name} <span className="text-slate-400">({a.ticker})</span>
              </p>
              <p className="text-xs text-slate-500">
                {a.sector} · {a.business_summary}
              </p>
            </div>
            <span className="shrink-0 text-sm text-slate-600">{a.weight_pct}%</span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <DividendChart data={plan.chart_data} />
      </div>

      <p className="mt-3 text-sm text-slate-600">{plan.advice_text}</p>

      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        className="mt-6 rounded border border-slate-300 px-4 py-2 text-sm text-slate-700"
      >
        {editing ? "수정 닫기" : "입력값 수정하기"}
      </button>

      {editing && (
        <div className="mt-6">
          <PlanBuilder
            initialValues={{
              target_monthly_dividend: plan.target_monthly_dividend,
              monthly_investment: plan.monthly_investment,
            }}
          />
        </div>
      )}
    </main>
  );
}
