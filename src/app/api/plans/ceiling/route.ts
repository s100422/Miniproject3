import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { typicalAnnualDividend } from "@/lib/dividendCalc";

/**
 * 입력 화면에 "이 정도까지가 현실적"이라고 안내하기 위한 값.
 * 30년 후 배당금은 투자금에 정비례하므로 월 $1 기준으로 한 번만 계산해두면
 * 클라이언트가 입력한 금액을 곱해서 바로 쓸 수 있다.
 */
export async function GET() {
  const { data: stocks, error } = await supabase
    .from("dividend_stocks")
    .select("dividend_yield, dividend_growth_5y");

  if (error || !stocks || stocks.length === 0) {
    return NextResponse.json({ error: "종목 정보를 불러오지 못했어요." }, { status: 503 });
  }

  const annualPerDollar = typicalAnnualDividend(
    stocks.map((s) => ({
      dividend_yield: s.dividend_yield,
      dividend_growth_5y: s.dividend_growth_5y ?? 0,
    })),
    1
  );

  return NextResponse.json({ maxMonthlyPerDollar: annualPerDollar / 12 });
}
