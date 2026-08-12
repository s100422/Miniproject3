import { toQuoteSymbol } from "./stockPrice";

const QUOTE_URL = (ticker: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    toQuoteSymbol(ticker)
  )}?range=8y&interval=1d&events=div`;

export type DividendRates = { dividend_yield: number | null; dividend_growth_5y: number | null };

type DividendEvent = { amount: number; date: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function fetchOne(ticker: string): Promise<[string, DividendRates] | null> {
  try {
    const res = await fetch(QUOTE_URL(ticker), {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice;
    const divsObj = result?.events?.dividends;
    if (typeof price !== "number" || price <= 0 || !divsObj) return null;

    const entries = Object.values(divsObj) as DividendEvent[];
    if (entries.length === 0) return null;

    // 배당 지급 빈도(분기/반기 등)와 무관하게 안전하도록 "몇 회"가 아니라 "최근 365일 총액"으로 계산한다
    const nowSec = Date.now() / 1000;
    const trailing365 = entries
      .filter((d) => d.date >= nowSec - 365 * 86400)
      .reduce((sum, d) => sum + d.amount, 0);
    const dividend_yield = trailing365 > 0 ? (trailing365 / price) * 100 : null;

    // 5년 CAGR: "가장 최근 완결된 연도" vs "그 5년 전 완결 연도"의 연간 배당 총액 비교
    const byYear = new Map<number, number>();
    for (const d of entries) {
      const year = new Date(d.date * 1000).getUTCFullYear();
      byYear.set(year, (byYear.get(year) ?? 0) + d.amount);
    }
    const currentYear = new Date().getUTCFullYear();
    const completedYears = [...byYear.keys()].filter((y) => y < currentYear);
    const endYear = completedYears.length > 0 ? Math.max(...completedYears) : null;
    const startYear = endYear != null ? endYear - 5 : null;
    const startAmount = startYear != null ? byYear.get(startYear) : undefined;
    const endAmount = endYear != null ? byYear.get(endYear) : undefined;
    const dividend_growth_5y =
      startAmount != null && endAmount != null && startAmount > 0
        ? (Math.pow(endAmount / startAmount, 1 / 5) - 1) * 100
        : null;

    if (dividend_yield == null && dividend_growth_5y == null) return null;
    return [
      ticker,
      {
        dividend_yield: dividend_yield != null ? round2(dividend_yield) : null,
        dividend_growth_5y: dividend_growth_5y != null ? round2(dividend_growth_5y) : null,
      },
    ];
  } catch {
    return null;
  }
}

/**
 * 야후 배당 이력에서 수익률·5년 성장률을 직접 계산한다(손입력 데이터 대체).
 * 계산 불가한 종목(상장 5년 미만, API 실패 등)은 결과에서 빠진다 —
 * 호출부가 DB에 저장된 값으로 폴백해야 한다(fetchPrices와 동일한 fail-open 패턴).
 */
export async function fetchDividendRates(tickers: string[]): Promise<Record<string, DividendRates>> {
  const unique = [...new Set(tickers)];
  const results = await Promise.all(unique.map(fetchOne));
  return Object.fromEntries(results.filter((r): r is [string, DividendRates] => r !== null));
}
