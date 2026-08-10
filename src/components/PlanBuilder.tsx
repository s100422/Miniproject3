"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAnonymousId } from "@/lib/anonymousId";
import type { YearlyProjection } from "@/lib/dividendCalc";
import DividendChart from "./DividendChart";
import { Spiral } from "./ui/spiral";

type Allocation = {
  ticker: string;
  weight_pct: number;
  name: string;
  sector: string;
  business_summary: string;
  dividend_yield: number;
  dividend_growth_5y: number;
  payout_months: number[];
  price: number | null;
  reason: string;
  risk: {
    signal: "dividend_cut" | "dividend_increase";
    reason: string;
    source_url: string;
  } | null;
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

const STORAGE_KEY = "planBuilderState";

// "출처" 링크로 나갔다가 뒤로가기로 돌아오면 탭이 새로고침되면서 입력값/생성 결과가 다
// 날아가버린다(React state는 메모리에만 있어서). 새로고침돼도 그대로 복원되도록 마운트
// 시점에 sessionStorage에서 한 번만 읽어온다(useState의 lazy initializer는 첫 렌더에만
// 실행되니 렌더마다 다시 읽지 않는다).
function loadSaved(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function PlanBuilder({ initialValues }: { initialValues?: InitialValues }) {
  const router = useRouter();
  const [target, setTarget] = useState(() => {
    if (initialValues) return initialValues.target_monthly_dividend.toString();
    const saved = loadSaved().target;
    return typeof saved === "string" ? saved : "";
  });
  const [monthlyInvestment, setMonthlyInvestment] = useState(() => {
    if (initialValues) return initialValues.monthly_investment.toString();
    const saved = loadSaved().monthlyInvestment;
    return typeof saved === "string" ? saved : "";
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(() => {
    if (initialValues) return null;
    const saved = loadSaved().candidates;
    return Array.isArray(saved) ? saved : null;
  });
  const [excluded, setExcluded] = useState<string[]>(() => {
    if (initialValues) return [];
    const saved = loadSaved().excluded;
    return Array.isArray(saved) ? saved : [];
  });
  const [preference, setPreference] = useState(() => {
    if (initialValues) return "";
    const saved = loadSaved().preference;
    return typeof saved === "string" ? saved : "";
  });

  // 플랜 상세화면의 "입력값 수정하기"(initialValues 있음)는 항상 그 플랜 값으로 시작해야
  // 하므로 저장 대상에서 뺀다.
  useEffect(() => {
    if (initialValues) return;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ target, monthlyInvestment, preference, excluded, candidates })
    );
  }, [initialValues, target, monthlyInvestment, preference, excluded, candidates]);

  const MAX_AMOUNT = 1_000_000;
  const targetNum = Number(target);
  const investNum = Number(monthlyInvestment);
  const allFilled = [target, monthlyInvestment].every((v) => v !== "");

  // 서버에서도 같은 규칙으로 막지만, 여기서 먼저 걸러야 사용자가 바로 알아챈다
  const inputError = !allFilled
    ? null
    : !Number.isFinite(targetNum) || targetNum <= 0
      ? "목표 월배당금액은 0보다 큰 숫자여야 해요."
      : !Number.isFinite(investNum) || investNum <= 0
        ? "월 투자계획금액은 0보다 큰 숫자여야 해요."
        : targetNum > MAX_AMOUNT || investNum > MAX_AMOUNT
          ? `금액은 $${MAX_AMOUNT.toLocaleString()} 이하로 입력해주세요.`
          : null;

  // 30년 후 배당금은 투자금에 정비례해서, 월 $1 기준 한도만 받아오면 곱해서 안내할 수 있다
  const [maxPerDollar, setMaxPerDollar] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/plans/ceiling")
      .then((r) => r.json())
      .then((d) => setMaxPerDollar(d.maxMonthlyPerDollar ?? null))
      .catch(() => {});
  }, []);

  const usd = (n: number) => `$${Math.floor(n).toLocaleString()}`;
  const investValid = Number.isFinite(investNum) && investNum > 0;
  const targetValid = Number.isFinite(targetNum) && targetNum > 0;

  const targetHint =
    maxPerDollar && investValid
      ? `월 ${usd(investNum)} 투자 기준, 30년 모으면 월 ${usd(investNum * maxPerDollar)} 정도까지가 현실적이에요.`
      : "해외여행 비용이면 월 $1,000~2,000 정도를 많이 잡아요.";

  const investHint =
    maxPerDollar && targetValid
      ? `월 ${usd(targetNum)}를 받으려면 월 ${usd(Math.ceil(targetNum / maxPerDollar))} 이상은 투자해야 해요.`
      : "매달 꾸준히 넣을 수 있는 금액이 좋아요. 월 $100~500으로 많이 시작해요.";

  async function handleSubmit(excludeList: string[] = excluded) {
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
          exclude: excludeList,
          preference,
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

  // 리스크 스크리닝은 배분을 자동으로 바꾸지 않는다 — 사용자가 직접 종목을 빼고 재생성해야 한다
  function excludeAndRegenerate(ticker: string) {
    const next = [...excluded, ticker];
    setExcluded(next);
    handleSubmit(next);
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
      sessionStorage.removeItem(STORAGE_KEY);
      router.push(`/plans/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <section className="mx-auto max-w-2xl rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
        <h2 className="mb-stack-lg text-headline-lg font-headline-lg text-primary">플랜 설계하기</h2>

        <div className="mb-stack-lg flex flex-col gap-stack-md">
          <div>
            <label
              htmlFor="target-monthly-dividend"
              className="mb-stack-sm block text-label-md font-label-md text-on-surface-variant"
            >
              목표 월배당금액 ($)
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute top-1/2 left-3 -translate-y-1/2 text-on-surface-variant">
                attach_money
              </span>
              <input
                id="target-monthly-dividend"
                type="number"
                min="1"
                max="1000000"
                className="w-full rounded-xl border border-outline-variant bg-surface py-3 pr-4 pl-10 text-body-lg font-body-lg transition-shadow focus:border-primary focus:ring-1 focus:ring-secondary focus:outline-none"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="1000"
              />
            </div>
            <p className="mt-2 text-label-md font-label-md text-secondary">{targetHint}</p>
          </div>

          <div>
            <label
              htmlFor="monthly-investment"
              className="mb-stack-sm block text-label-md font-label-md text-on-surface-variant"
            >
              월 투자계획금액 ($)
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute top-1/2 left-3 -translate-y-1/2 text-on-surface-variant">
                savings
              </span>
              <input
                id="monthly-investment"
                type="number"
                min="1"
                max="1000000"
                className="w-full rounded-xl border border-outline-variant bg-surface py-3 pr-4 pl-10 text-body-lg font-body-lg transition-shadow focus:border-primary focus:ring-1 focus:ring-secondary focus:outline-none"
                value={monthlyInvestment}
                onChange={(e) => setMonthlyInvestment(e.target.value)}
                placeholder="300"
              />
            </div>
            <p className="mt-2 text-label-md font-label-md text-secondary">{investHint}</p>
          </div>

          <div>
            <label
              htmlFor="preference"
              className="mb-stack-sm block text-label-md font-label-md text-on-surface-variant"
            >
              선호/제외 조건 (선택)
            </label>
            <textarea
              id="preference"
              rows={2}
              className="w-full rounded-xl border border-outline-variant bg-surface p-4 text-body-md font-body-md transition-shadow focus:border-primary focus:ring-1 focus:ring-secondary focus:outline-none"
              value={preference}
              onChange={(e) => setPreference(e.target.value)}
              placeholder="예: 담배·에너지주는 빼줘, 안정적인 우량주 위주로"
            />
          </div>
        </div>

        {inputError && (
          <p className="mb-stack-md flex items-center gap-stack-sm text-label-md font-label-md text-error">
            <span className="material-symbols-outlined text-base">error</span>
            {inputError}
          </p>
        )}

        <button
          type="button"
          disabled={!allFilled || !!inputError || loading}
          onClick={() => handleSubmit()}
          className="w-full rounded-xl bg-primary py-4 text-body-lg font-body-lg font-bold text-on-primary transition-opacity hover:opacity-90 disabled:bg-surface-container-high disabled:text-outline"
        >
          {loading ? (
            <Spiral className="size-5" />
          ) : (
            "플랜 만들기"
          )}
        </button>
      </section>

      {error && (
        <div className="mx-auto mt-stack-lg max-w-2xl rounded-xl border border-error-container bg-error-container p-stack-lg">
          <p className="text-body-md font-body-md text-on-error-container">{error}</p>
          <button
            type="button"
            onClick={() => handleSubmit()}
            className="mt-stack-md rounded-lg bg-primary px-4 py-2 text-label-md font-label-md font-bold text-on-primary transition-opacity hover:opacity-90"
          >
            다시 시도
          </button>
        </div>
      )}

      {candidates?.some((c) => c.allocations.some((a) => a.price != null)) && (
        <p className="mx-auto mt-section-gap max-w-4xl rounded-xl bg-surface-container-low px-4 py-3 text-label-md font-label-md text-on-surface-variant">
          표시된 주가는 <strong className="text-primary">지금 이 플랜을 만드는 시점</strong>의 값이에요.
          주가는 이후에 오르내릴 수 있지만, 이 플랜은 지금 시가를 기준으로 계산했어요.
        </p>
      )}

      {candidates?.some((c) => c.allocations.some((a) => a.risk)) && (
        <p className="mx-auto mt-stack-sm max-w-4xl rounded-xl bg-surface-container-low px-4 py-3 text-label-md font-label-md text-on-surface-variant">
          아래 배당 소식은 <strong className="text-primary">배당 데이터 기준으로 이미 짜인 포트폴리오</strong>에 대해
          그 이후 확인된 최신 뉴스예요. 배분 비중에는 반영되지 않았으니, 참고해서 필요하면 직접 종목을 빼고
          다시 만들어보세요.
        </p>
      )}

      {candidates && (
        <section className="mx-auto mt-stack-lg flex max-w-4xl flex-col gap-stack-lg">
          {candidates.map((c, i) => {
            const lastRow = c.chart_data[c.chart_data.length - 1];
            const goalRatio = lastRow ? lastRow.growthReinvest / 12 / Number(target) : 0;
            const isClose = goalRatio >= 0.8;

            return (
            <article
              key={i}
              className={`relative flex flex-col gap-8 overflow-hidden rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)] md:flex-row${
                c.goal_achieved ? "" : " border border-error-container"
              }`}
            >
              {!c.goal_achieved && (
                <div className="absolute top-0 right-0 flex items-center gap-1 rounded-bl-xl bg-error-container px-4 py-2 text-label-md font-label-md font-bold text-on-error-container">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  {isClose ? "목표에 근접한 대안입니다" : "목표 달성이 어려운 대안입니다"}
                </div>
              )}

              <div className={`flex-1${c.goal_achieved ? "" : " mt-8 md:mt-0"}`}>
                <div className="mb-stack-sm inline-flex items-center gap-1 rounded-full bg-secondary-container px-3 py-1 text-label-md font-label-md text-on-secondary-container">
                  <span className="material-symbols-outlined text-sm">trending_up</span>
                  월 {c.monthly_investment}달러 투자 시나리오
                </div>
                <h3 className="mb-stack-md text-headline-md font-headline-md text-primary">{c.concept}</h3>

                <div
                  className={
                    c.goal_achieved
                      ? "mb-stack-lg flex items-start gap-2 rounded-lg bg-secondary-container p-4 text-body-md font-body-md text-on-secondary-container"
                      : "mb-stack-lg flex items-start gap-2 rounded-lg bg-error-container p-4 text-body-md font-body-md text-on-error-container"
                  }
                >
                  <span className="material-symbols-outlined icon-fill shrink-0 text-xl">
                    tips_and_updates
                  </span>
                  <p>{c.advice_text}</p>
                </div>

                <div className="mb-stack-lg flex flex-col gap-stack-md">
                  {c.allocations.map((a) => (
                    <div
                      key={a.ticker}
                      className="flex items-start justify-between gap-gutter rounded-lg bg-surface p-4"
                    >
                      <div>
                        <p className="text-body-md font-body-md font-bold text-primary">
                          {a.name} <span className="text-secondary">({a.ticker})</span>
                        </p>
                        <p className="text-label-md font-label-md text-on-surface-variant">
                          {a.sector} · {a.business_summary}
                        </p>
                        <p className="mt-stack-sm text-label-md font-label-md text-on-surface-variant">
                          수익률 {a.dividend_yield}%
                          {a.price != null && ` · 주가 $${a.price.toFixed(2)}`} · 배당지급월{" "}
                          {a.payout_months.join("·")}월
                        </p>
                        <p className="mt-stack-sm text-label-md font-label-md text-outline">
                          {a.reason}
                        </p>
                        {a.risk && (
                          <div
                            className={`mt-stack-sm flex flex-wrap items-center gap-2 rounded-lg p-2 text-label-md font-label-md ${
                              a.risk.signal === "dividend_cut"
                                ? "bg-error-container text-on-error-container"
                                : "bg-secondary-container text-on-secondary-container"
                            }`}
                          >
                            <span className="material-symbols-outlined text-base">
                              {a.risk.signal === "dividend_cut" ? "warning" : "trending_up"}
                            </span>
                            <span>{a.risk.reason}</span>
                            <a
                              href={a.risk.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              출처
                            </a>
                            {a.risk.signal === "dividend_cut" && (
                              <button
                                type="button"
                                onClick={() => excludeAndRegenerate(a.ticker)}
                                className="rounded-full bg-surface px-3 py-1 text-on-surface transition-colors hover:bg-surface-container-high"
                              >
                                이 종목 빼고 다시 만들기
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-body-md font-body-md font-bold text-secondary">
                        {a.weight_pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between">
                <div className="mb-stack-md rounded-xl border border-outline-variant bg-surface p-4">
                  <DividendChart data={c.chart_data} goalAnnual={Number(target) * 12} />
                </div>

                <div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSelect(c)}
                    className="w-full rounded-xl bg-secondary py-3 text-body-md font-body-md font-bold text-on-primary transition-colors hover:bg-on-secondary-container disabled:bg-surface-container-high disabled:text-outline"
                  >
                    {saving ? "저장 중..." : "이 플랜 선택하기"}
                  </button>
                </div>
              </div>
            </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
