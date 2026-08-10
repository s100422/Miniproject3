"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PlanBuilder from "@/components/PlanBuilder";
import DividendSimulator from "@/components/DividendSimulator";
import DividendCalendar from "@/components/DividendCalendar";
import AllocationPie, { colorFor } from "@/components/AllocationPie";
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
    dividend_yield?: number;
    dividend_growth_5y?: number;
    payout_months?: number[];
    price?: number | null;
  }[];
  chart_data: YearlyProjection[];
  advice_text: string;
  goal_achieved: boolean;
};

const TABS = ["플랜 상세", "배당 시뮬레이터", "배당지급월"] as const;
type Tab = (typeof TABS)[number];

const CARD =
  "bg-surface-container-lowest rounded-2xl p-stack-lg shadow-[0_4px_12px_rgba(0,8,31,0.05)]";

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [tab, setTab] = useState<Tab>("플랜 상세");

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
      <main className="mx-auto w-full max-w-[1200px] px-container-margin py-section-gap pb-[100px] md:pb-section-gap">
        <p className="text-body-md font-body-md text-error">플랜을 찾을 수 없어요.</p>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-container-margin py-section-gap pb-[100px] md:pb-section-gap">
        <p className="text-body-md font-body-md text-on-surface-variant">불러오는 중...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-stack-lg px-container-margin py-section-gap pb-[100px] md:pb-section-gap">
      {/* 플랜 헤더 */}
      <div>
        {editingName ? (
          <div className="flex items-center gap-stack-md">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="플랜 이름"
              className="min-w-0 flex-1 rounded-lg border border-surface-variant bg-surface px-4 py-2 text-headline-md font-headline-md text-primary focus:border-secondary focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={saveName}
              className="shrink-0 text-label-md font-label-md text-secondary transition-colors hover:text-on-secondary-container"
            >
              저장
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-stack-md">
            <h2 className="text-headline-lg font-headline-lg text-primary md:text-display-lg md:font-display-lg">
              {plan.name || "플랜 상세"}
            </h2>
            <button
              type="button"
              aria-label="이름 변경"
              onClick={() => setEditingName(true)}
              className="shrink-0 text-on-surface-variant transition-colors hover:text-primary"
            >
              <span className="material-symbols-outlined">edit</span>
            </button>
          </div>
        )}
        <p className="mt-stack-sm text-body-md font-body-md text-on-surface-variant">
          목표 월 <span className="font-bold text-primary">${plan.target_monthly_dividend}</span> · 월{" "}
          <span className="font-bold text-primary">${plan.monthly_investment}</span> 투자
        </p>
      </div>

      {/* Pill Tabs */}
      <div className="flex gap-stack-sm overflow-x-auto pb-stack-sm">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-full px-6 py-2 text-label-md font-label-md transition-colors ${
              tab === t
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface hover:bg-surface-container-high"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "플랜 상세" && (
        <section className="space-y-stack-lg">
          {!plan.goal_achieved && (
            <div className="flex items-center gap-base rounded-xl bg-secondary-container px-stack-md py-stack-md text-on-secondary-container">
              <span className="material-symbols-outlined">info</span>
              <p className="text-label-md font-label-md">목표에 근접한 대안입니다</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-container-margin @5xl:grid-cols-3">
            {/* 비중 차트 */}
            <div className={`${CARD} col-span-1 flex flex-col`}>
              <h3 className="mb-stack-lg text-headline-md font-headline-md text-primary">
                포트폴리오 비중
              </h3>
              <div className="flex flex-1 items-center justify-center">
                <AllocationPie allocations={plan.allocations} />
              </div>
              <ul className="mt-stack-lg flex flex-wrap justify-center gap-x-gutter gap-y-stack-sm">
                {plan.allocations.map((a, i) => (
                  <li key={a.ticker} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorFor(i) }}
                    />
                    <span className="text-label-md font-label-md text-on-surface-variant">
                      {a.ticker} <span className="font-bold text-on-surface">{a.weight_pct}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 종목 목록 */}
            <div className={`${CARD} col-span-1 lg:col-span-2`}>
              <h3 className="mb-stack-lg text-headline-md font-headline-md text-primary">
                종목 상세
              </h3>
              <div className="space-y-stack-md">
                {plan.allocations.map((a, i) => (
                  <div
                    key={a.ticker}
                    className="flex items-start justify-between gap-gutter rounded-xl bg-surface p-stack-md transition-colors hover:bg-surface-container-low"
                  >
                    <div className="flex min-w-0 items-start gap-gutter">
                      <span
                        className="mt-2 h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: colorFor(i) }}
                      />
                      <div className="min-w-0">
                        <h4 className="text-body-lg font-body-lg font-bold text-on-surface">
                          {a.name} <span className="text-secondary">({a.ticker})</span>
                        </h4>
                        <p className="text-label-md font-label-md text-on-surface-variant">
                          {a.sector} · {a.business_summary}
                        </p>
                        {a.payout_months && (
                          <p className="mt-stack-sm text-label-md font-label-md text-outline">
                            배당지급월 {a.payout_months.join("·")}월
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-body-lg font-body-lg font-bold text-primary">
                        {a.weight_pct}%
                      </p>
                      {a.dividend_yield != null && (
                        <p className="text-label-md font-label-md text-secondary">
                          연 {a.dividend_yield}% 수익률
                        </p>
                      )}
                      {a.price != null && (
                        <p className="text-label-md font-label-md text-on-surface-variant">
                          주가 ${a.price.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {plan.allocations.some((a) => a.price != null) && (
                <p className="mt-stack-md text-label-md font-label-md text-outline">
                  주가는 이 플랜을 만든 시점의 값이에요. 이후 오르내릴 수 있지만, 플랜은 만들 때의
                  시가를 기준으로 계산했어요.
                </p>
              )}
            </div>
          </div>

          {/* AI 조언 */}
          <div className={CARD}>
            <h3 className="mb-stack-md text-headline-md font-headline-md text-primary">
              플랜 요약
            </h3>
            <p className="text-body-md font-body-md text-on-surface-variant">{plan.advice_text}</p>
          </div>

          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="flex items-center gap-base rounded-full border border-surface-variant bg-surface-container-lowest px-6 py-3 text-label-md font-label-md text-on-surface transition-colors hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">tune</span>
            {editing ? "수정 닫기" : "입력값 수정하기"}
          </button>

          {editing && (
            <div className={CARD}>
              <PlanBuilder
                initialValues={{
                  target_monthly_dividend: plan.target_monthly_dividend,
                  monthly_investment: plan.monthly_investment,
                }}
              />
            </div>
          )}
        </section>
      )}

      {tab === "배당 시뮬레이터" && (
        <section className={CARD}>
          <div className="overflow-x-auto">
            <DividendSimulator
              chartData={plan.chart_data}
              allocations={plan.allocations}
              targetMonthlyDividend={plan.target_monthly_dividend}
            />
          </div>
        </section>
      )}

      {tab === "배당지급월" && (
        <section className={CARD}>
          <div className="overflow-x-auto">
            <DividendCalendar
              allocations={plan.allocations}
              monthlyInvestment={plan.monthly_investment}
            />
          </div>
        </section>
      )}
    </main>
  );
}
