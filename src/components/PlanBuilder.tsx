"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAnonymousId } from "@/lib/anonymousId";
import type { YearlyProjection } from "@/lib/dividendCalc";
import DividendChart from "./DividendChart";

type Allocation = {
  ticker: string;
  weight_pct: number;
  name: string;
  sector: string;
  business_summary: string;
};

type Candidate = {
  concept: string;
  monthly_investment: number;
  allocations: Allocation[];
  advice_text: string;
  goal_achieved: boolean;
  chart_data: YearlyProjection[];
};

type InitialValues = {
  target_monthly_dividend: number;
  monthly_investment: number;
};

export default function PlanBuilder({ initialValues }: { initialValues?: InitialValues }) {
  const router = useRouter();
  const [target, setTarget] = useState(initialValues?.target_monthly_dividend?.toString() ?? "");
  const [monthlyInvestment, setMonthlyInvestment] = useState(
    initialValues?.monthly_investment?.toString() ?? ""
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  const allFilled = [target, monthlyInvestment].every((v) => v !== "");

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setCandidates(null);
    try {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_monthly_dividend: Number(target),
          monthly_investment: Number(monthlyInvestment),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "생성에 실패했어요.");
        return;
      }
      setCandidates(data.candidates);
    } catch {
      setError("생성에 실패했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(candidate: Candidate) {
    setSaving(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const { data, error: insertError } = await supabase
        .from("plans")
        .insert({
          anonymous_id: getAnonymousId(),
          user_id: session.session?.user.id ?? null,
          target_monthly_dividend: Number(target),
          monthly_investment: candidate.monthly_investment,
          allocations: candidate.allocations,
          chart_data: candidate.chart_data,
          advice_text: candidate.advice_text,
          goal_achieved: candidate.goal_achieved,
        })
        .select("id")
        .single();

      if (insertError || !data) {
        setError("저장에 실패했어요.");
        return;
      }
      router.push(`/plans/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm text-slate-700">
          목표 월배당금액 ($)
          <input
            type="number"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="2000"
          />
        </label>
        <label className="text-sm text-slate-700">
          월 투자계획금액 ($)
          <input
            type="number"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={monthlyInvestment}
            onChange={(e) => setMonthlyInvestment(e.target.value)}
            placeholder="300"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={!allFilled || loading}
        onClick={handleSubmit}
        className="mt-6 w-full rounded bg-emerald-700 py-3 text-white disabled:bg-slate-300"
      >
        {loading ? "생성 중..." : "플랜 만들기"}
      </button>

      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">{error}</p>
          <button
            type="button"
            onClick={handleSubmit}
            className="mt-2 rounded bg-red-600 px-4 py-2 text-sm text-white"
          >
            다시 시도
          </button>
        </div>
      )}

      {candidates && (
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          {candidates.map((c, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-4">
              {!c.goal_achieved && (
                <span className="mb-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  목표에 근접한 대안입니다
                </span>
              )}
              <p className="font-medium text-slate-900">{c.concept}</p>
              <p className="mt-1 text-sm text-slate-600">월 {c.monthly_investment}달러 투자 시나리오</p>

              <div className="mt-3 space-y-2">
                {c.allocations.map((a) => (
                  <div
                    key={a.ticker}
                    className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2"
                  >
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
                <DividendChart data={c.chart_data} />
              </div>

              <p className="mt-3 text-sm text-slate-600">{c.advice_text}</p>

              <button
                type="button"
                disabled={saving}
                onClick={() => handleSelect(c)}
                className="mt-4 w-full rounded bg-slate-900 py-2 text-white disabled:bg-slate-300"
              >
                {saving ? "저장 중..." : "이 플랜 선택하기"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
