import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callGemini, validateCandidate, type PlanInput, type DividendStock } from "@/lib/gemini";
import { fetchPrices } from "@/lib/stockPrice";
import {
  projectDividendGrowth,
  realisticBestAnnualDividend,
  MILESTONE_YEARS,
} from "@/lib/dividendCalc";

type StockRow = DividendStock & { dividend_growth_5y: number; business_summary: string };

export const MAX_AMOUNT = 1_000_000;
// 현실 기준보다 이만큼까지는 "해볼 만하다"고 보고 통과시킨다(AI가 더 잘 짤 여지)
const FEASIBILITY_HEADROOM = 1.5;

export async function POST(request: Request) {
  const body = await request.json();
  const target_monthly_dividend = Number(body.target_monthly_dividend);
  const monthly_investment = Number(body.monthly_investment);

  // 클라이언트를 우회해 들어오는 값도 있으므로 서버에서 다시 막는다(음수·0·NaN·과대값)
  for (const [label, value] of [
    ["목표 월배당금액", target_monthly_dividend],
    ["월 투자계획금액", monthly_investment],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: `${label}은 0보다 큰 숫자여야 해요.` }, { status: 400 });
    }
    if (value > MAX_AMOUNT) {
      return NextResponse.json(
        { error: `${label}이 너무 커요. $${MAX_AMOUNT.toLocaleString()} 이하로 입력해주세요.` },
        { status: 400 }
      );
    }
  }

  const { data: stocks, error } = await supabase.from("dividend_stocks").select("*");
  if (error || !stocks || stocks.length === 0) {
    return NextResponse.json({ error: "지금은 추천 가능한 배당주가 없어요." }, { status: 503 });
  }

  const stockRates = Object.fromEntries(
    (stocks as StockRow[]).map((s) => [
      s.ticker,
      { dividend_yield: s.dividend_yield, dividend_growth_5y: s.dividend_growth_5y ?? 0 },
    ])
  );

  // 현실적으로 못 만드는 조합이면 20초짜리 AI 호출 전에 막는다
  const bestAnnual = realisticBestAnnualDividend(
    (stocks as StockRow[]).map((s) => ({
      ticker: s.ticker,
      payout_months: s.payout_months,
      dividend_yield: s.dividend_yield,
      dividend_growth_5y: s.dividend_growth_5y ?? 0,
    })),
    monthly_investment
  );
  if (target_monthly_dividend * 12 > bestAnnual * FEASIBILITY_HEADROOM) {
    const bestMonthly = Math.floor(bestAnnual / 12);
    const needed = Math.ceil((monthly_investment * target_monthly_dividend * 12) / bestAnnual);
    return NextResponse.json(
      {
        error:
          `월 $${monthly_investment.toLocaleString()} 투자로는 30년을 모아도 월 $${bestMonthly.toLocaleString()} 정도가 현실적인 최선이라, ` +
          `월 $${target_monthly_dividend.toLocaleString()} 목표는 만들기 어려워요. ` +
          `월 $${needed.toLocaleString()} 이상 투자하거나 목표를 낮춰주세요.`,
      },
      { status: 400 }
    );
  }

  const input: PlanInput = { target_monthly_dividend, monthly_investment };

  let candidates;
  try {
    candidates = await callGemini(input, stocks as StockRow[]);
  } catch {
    return NextResponse.json({ error: "AI 생성에 실패했어요. 다시 시도해주세요." }, { status: 502 });
  }

  for (const c of candidates) {
    const check = validateCandidate(c, stocks as StockRow[]);
    if (!check.valid) {
      return NextResponse.json({ error: "AI 응답 검증에 실패했어요. 다시 시도해주세요." }, { status: 502 });
    }
  }
  const stockInfo = Object.fromEntries((stocks as StockRow[]).map((s) => [s.ticker, s]));

  // 플랜은 "지금 시가" 기준으로 짜는 것이므로, 생성 시점 주가를 함께 저장해 스냅샷으로 남긴다
  const prices = await fetchPrices(candidates.flatMap((c) => c.allocations.map((a) => a.ticker)));

  const results = candidates.map((c) => {
    const rows = projectDividendGrowth(c.allocations, stockRates, monthly_investment, 360);
    const chart_data = rows.filter((r) => MILESTONE_YEARS.includes(r.year));
    // 차트의 목표 도달 표시와 같은 기준(재투자 시나리오)을 써야 배지와 차트가 어긋나지 않는다
    const goal_achieved = chart_data.some((r) => r.growthReinvest / 12 >= target_monthly_dividend);

    return {
      ...c,
      allocations: c.allocations.map((a) => ({
        ...a,
        name: stockInfo[a.ticker].name,
        sector: stockInfo[a.ticker].sector,
        business_summary: stockInfo[a.ticker].business_summary,
        dividend_yield: stockInfo[a.ticker].dividend_yield,
        dividend_growth_5y: stockInfo[a.ticker].dividend_growth_5y,
        payout_months: stockInfo[a.ticker].payout_months,
        price: prices[a.ticker] ?? null,
      })),
      monthly_investment,
      chart_data,
      goal_achieved,
    };
  });

  return NextResponse.json({ candidates: results });
}
