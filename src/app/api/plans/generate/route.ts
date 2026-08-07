import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callGemini, validateCandidate, type PlanInput, type DividendStock } from "@/lib/gemini";
import { projectDividendGrowth, MILESTONE_YEARS } from "@/lib/dividendCalc";

type StockRow = DividendStock & { dividend_growth_5y: number; business_summary: string };

export async function POST(request: Request) {
  const body = await request.json();
  const { target_monthly_dividend, monthly_investment } = body;

  if (!target_monthly_dividend || !monthly_investment) {
    return NextResponse.json({ error: "입력값이 비어있습니다." }, { status: 400 });
  }

  const { data: stocks, error } = await supabase.from("dividend_stocks").select("*");
  if (error || !stocks || stocks.length === 0) {
    return NextResponse.json({ error: "지금은 추천 가능한 배당주가 없어요." }, { status: 503 });
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

  const stockRates = Object.fromEntries(
    (stocks as StockRow[]).map((s) => [
      s.ticker,
      { dividend_yield: s.dividend_yield, dividend_growth_5y: s.dividend_growth_5y },
    ])
  );
  const stockInfo = Object.fromEntries((stocks as StockRow[]).map((s) => [s.ticker, s]));

  const results = candidates.map((c) => {
    const rows = projectDividendGrowth(c.allocations, stockRates, monthly_investment, 240);
    const chart_data = rows.filter((r) => MILESTONE_YEARS.includes(r.year));
    const goal_achieved = chart_data.some((r) => r.growth / 12 >= target_monthly_dividend);

    return {
      ...c,
      allocations: c.allocations.map((a) => ({
        ...a,
        name: stockInfo[a.ticker].name,
        sector: stockInfo[a.ticker].sector,
        business_summary: stockInfo[a.ticker].business_summary,
      })),
      monthly_investment,
      chart_data,
      goal_achieved,
    };
  });

  return NextResponse.json({ candidates: results });
}
