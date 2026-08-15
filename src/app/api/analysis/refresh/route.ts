import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchDividendRates } from "@/lib/dividendRates";
import { fetchFundamentals } from "@/lib/fundamentals";
import { scoreTicker } from "@/lib/dividendScore";

/**
 * 야간 배치. 카탈로그 전 종목의 재무·배당이력을 모아 4축 점수를 내고 `ticker_analysis`에 쌓는다.
 *
 * **분석 대상은 사용자가 아니라 종목이다.** 결과는 전 사용자가 공유하므로 이 경로는
 * 사용자 수와 무관하게 하루 한 번만 돈다(docs/ROADMAP.md).
 *
 * Vercel 크론이 `Authorization: Bearer $CRON_SECRET`을 붙여 GET으로 호출한다.
 */

// 86종목 실측 5초 안팎이지만, 야후가 느려질 때를 감안해 여유를 둔다.
export const maxDuration = 60;

type CatalogRow = { ticker: string; sector: string; consecutive_years: number };

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았다" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // 카탈로그는 공개 읽기라 anon으로 충분하다. 서비스롤은 쓰기에만 쓴다.
  const { data: catalog, error: catalogError } = await supabase
    .from("dividend_stocks")
    .select("ticker, sector, consecutive_years");
  if (catalogError || !catalog?.length) {
    return NextResponse.json({ error: "카탈로그를 못 읽었다" }, { status: 503 });
  }

  const tickers = (catalog as CatalogRow[]).map((s) => s.ticker);
  const [rates, fundamentals] = await Promise.all([
    fetchDividendRates(tickers),
    fetchFundamentals(tickers),
  ]);

  const as_of = new Date().toISOString().slice(0, 10);
  const rows = (catalog as CatalogRow[]).map((stock) => {
    const rate = rates[stock.ticker] ?? null;
    const f = fundamentals[stock.ticker];
    const result = scoreTicker({
      ticker: stock.ticker,
      sector: stock.sector,
      consecutive_years: stock.consecutive_years,
      rates: rate,
      fundamentals: f?.ok ? f.data : null,
    });

    return {
      ticker: stock.ticker,
      as_of,
      total_score: result.total,
      safety_score: result.safety,
      growth_score: result.growth,
      strength_score: result.strength,
      value_score: result.value,
      dividend_yield: rate?.dividend_yield ?? null,
      dividend_growth_5y: rate?.dividend_growth_5y ?? null,
      price: rate?.price ?? null,
      status: result.status,
      metrics: {
        ...result.metrics,
        flags: result.flags,
        // 실패 사유를 남겨야 "왜 미분석인지"를 나중에 추적할 수 있다.
        fetch_error: f?.ok === false ? f.error : null,
      },
    };
  });

  // 실패한 종목도 status:'failed'로 함께 저장한다. 조용히 빼면 화면에서 그 종목이 사라져
  // 위험 노출도 계산이 틀린다(로드맵 86줄).
  const { error: writeError } = await supabaseAdmin()
    .from("ticker_analysis")
    .upsert(rows, { onConflict: "ticker,as_of" });

  if (writeError) {
    return NextResponse.json({ error: `저장 실패: ${writeError.message}` }, { status: 500 });
  }

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return NextResponse.json({
    as_of,
    total: rows.length,
    ok: count("ok"),
    partial: count("partial"),
    failed: count("failed"),
    elapsed_ms: Date.now() - startedAt,
  });
}
