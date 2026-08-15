// Yahoo는 클래스주를 점이 아닌 하이픈으로 쓴다(BF.B -> BF-B)
export const toQuoteSymbol = (ticker: string) => ticker.replace(".", "-");

/** 야후 동시 요청 상한. 카탈로그 86종목을 전량 병렬로 던지면 429 위험이 크다. */
export const YAHOO_CONCURRENCY = 6;

/**
 * 동시 실행을 limit개로 묶어 순회한다. 야후엔 레이트리밋이 있어서 카탈로그 86종목을
 * Promise.all로 전량 병렬 요청하면 429를 맞을 수 있다. 결과 순서는 입력 순서와 같다.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

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
