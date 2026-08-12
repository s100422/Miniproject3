// Yahoo는 클래스주를 점이 아닌 하이픈으로 쓴다(BF.B -> BF-B)
export const toQuoteSymbol = (ticker: string) => ticker.replace(".", "-");

const QUOTE_URL = (ticker: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    toQuoteSymbol(ticker)
  )}?interval=1d&range=1d`;

async function fetchOne(ticker: string): Promise<[string, number] | null> {
  try {
    const res = await fetch(QUOTE_URL(ticker), {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" && price > 0 ? [ticker, price] : null;
  } catch {
    return null;
  }
}

/**
 * 티커별 현재가를 병렬로 가져온다.
 * 주가는 플랜의 부가 정보라, 못 가져온 종목은 조용히 빼고 진행한다
 * (외부 API 장애로 플랜 생성 자체가 실패하면 안 된다).
 */
export async function fetchPrices(tickers: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(tickers)];
  const results = await Promise.all(unique.map(fetchOne));
  return Object.fromEntries(results.filter((r): r is [string, number] => r !== null));
}
