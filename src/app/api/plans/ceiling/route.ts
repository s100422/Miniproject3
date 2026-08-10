import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { realisticBestAnnualDividend } from "@/lib/dividendCalc";

/**
 * 입력 화면에 "이 정도까지가 현실적"이라고 안내하기 위한 값.
 * 30년 후 배당금은 투자금에 정비례하므로 월 $1 기준으로 한 번만 계산해두면
 * 클라이언트가 입력한 금액을 곱해서 바로 쓸 수 있다.
 */
// ponytail: realisticBestAnnualDividend는 "섹터당 1종목 중 최선의 조합"이라는
// 결정론적 최선책이라, 실제로 AI가 그 섹터 안에서 최선의 종목을 고르지 못하면
// 실측값이 이보다 30~50%가량 낮게 나온다(실제 생성 결과로 확인함). AI 선택 품질을
// 예측할 수 없으니 안전마진을 곱해 힌트가 실제로 달성 가능한 쪽에 가깝게 한다.
// 업그레이드 경로: AI 프롬프트가 종목 선택 품질을 일관되게 높이면 마진을 올린다.
const REALISM_MARGIN = 0.5;
export async function GET() {
  const { data: stocks, error } = await supabase
    .from("dividend_stocks")
    .select("ticker, sector, payout_months, dividend_yield, dividend_growth_5y");

  if (error || !stocks || stocks.length === 0) {
    return NextResponse.json({ error: "종목 정보를 불러오지 못했어요." }, { status: 503 });
  }

  const annualPerDollar = realisticBestAnnualDividend(
    stocks.map((s) => ({
      ticker: s.ticker,
      sector: s.sector,
      payout_months: s.payout_months,
      dividend_yield: s.dividend_yield,
      dividend_growth_5y: s.dividend_growth_5y ?? 0,
    })),
    1
  );

  return NextResponse.json({ maxMonthlyPerDollar: (annualPerDollar / 12) * REALISM_MARGIN });
}
