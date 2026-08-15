import { mapLimit, toQuoteSymbol, YAHOO_CONCURRENCY } from "./stockPrice";

const QUOTE_URL = (ticker: string) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    toQuoteSymbol(ticker)
  )}?range=8y&interval=1d&events=div`;

export type DividendRates = {
  dividend_yield: number | null;
  dividend_growth_5y: number | null;
  /** 직전 완결 연도 vs 그 전년. 5년 CAGR과의 차이가 "성장 감속"이다. */
  dividend_growth_1y: number | null;
  /** 과거 5년간 매월 계산한 배당수익률의 평균. 지금 수익률이 이상하게 높은지 판단하는 기준선. */
  yield_avg_5y: number | null;
  /** 같은 표본의 표준편차. 배당함정 판정의 +1.5σ가 이 값이다. */
  yield_sd_5y: number | null;
  /** 12개월 주가 변화율(%). */
  price_change_12m: number | null;
  price: number | null;
};

export type DividendEvent = { amount: number; date: number };
export type PricePoint = { t: number; c: number };

const DAY = 86400;
const YEAR = 365 * DAY;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** t 시점 이하의 마지막 종가. 주말·휴장일에도 값이 나오도록 이진탐색으로 직전 거래일을 찾는다. */
export function priceAt(prices: PricePoint[], t: number): number | null {
  if (prices.length === 0 || t < prices[0].t) return null;
  let lo = 0;
  let hi = prices.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (prices[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return prices[lo].c;
}

/** t 시점 기준 직전 365일 배당 합계. */
function trailingDividend(divs: DividendEvent[], t: number): number {
  return divs.reduce((sum, d) => (d.date <= t && d.date > t - YEAR ? sum + d.amount : sum), 0);
}

/**
 * 과거 5년치 배당수익률을 월 단위로 되짚어 평균·표준편차를 낸다.
 * "지금 수익률이 자기 역사에 비해 얼마나 높은가"가 배당함정 판정의 핵심 축이고,
 * 그 기준선을 종목마다 따로 가져야 섹터·주가대 차이에 휘둘리지 않는다.
 */
function yieldStats(
  prices: PricePoint[],
  divs: DividendEvent[],
  now: number
): { avg: number | null; sd: number | null } {
  const samples: number[] = [];
  for (let m = 0; m < 60; m++) {
    const at = now - m * 30.44 * DAY;
    const price = priceAt(prices, at);
    const ttm = trailingDividend(divs, at);
    if (price != null && price > 0 && ttm > 0) samples.push((ttm / price) * 100);
  }
  // 표본이 너무 적으면(상장 5년 미만, 배당 시작 직후) 평균이 기준선 노릇을 못 한다.
  if (samples.length < 24) return { avg: null, sd: null };
  const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
  const variance = samples.reduce((s, v) => s + (v - avg) ** 2, 0) / samples.length;
  return { avg, sd: Math.sqrt(variance) };
}

/** 연도별 배당 총액에서 n년 CAGR. endYear는 "가장 최근 완결된 연도". */
function cagr(byYear: Map<number, number>, endYear: number | null, years: number): number | null {
  if (endYear == null) return null;
  const start = byYear.get(endYear - years);
  const end = byYear.get(endYear);
  if (start == null || end == null || start <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

/**
 * 주가·배당 이력에서 `at` 시점 기준 파생값을 낸다. 시점을 인자로 받는 이유는
 * **과거 시점으로 되돌려 검증하기 위해서다** — 이미 배당을 삭감한 종목의 삭감 직전
 * 데이터를 넣어 경고가 떴는지 본다(dividendRates.backtest.check.ts).
 */
export function deriveRates(
  prices: PricePoint[],
  divs: DividendEvent[],
  at: number,
  price: number
): DividendRates {
  const r2 = (n: number | null) => (n != null ? round2(n) : null);
  const past = priceAt(prices, at - YEAR);
  const price_change_12m = past != null && past > 0 ? (price / past - 1) * 100 : null;

  if (divs.length === 0) {
    return {
      dividend_yield: null,
      dividend_growth_5y: null,
      dividend_growth_1y: null,
      yield_avg_5y: null,
      yield_sd_5y: null,
      price_change_12m: r2(price_change_12m),
      price,
    };
  }

  // 배당 지급 빈도(분기/반기 등)와 무관하게 안전하도록 "몇 회"가 아니라 "최근 365일 총액"으로 계산한다
  const trailing365 = trailingDividend(divs, at);
  const dividend_yield = trailing365 > 0 ? (trailing365 / price) * 100 : null;

  // 5년/1년 CAGR: "가장 최근 완결된 연도"를 끝점으로 잡아 미완결 연도의 부분 합계를 배제한다.
  // `at` 이후의 배당은 그 시점엔 알 수 없는 정보라 아예 빼고 센다.
  const byYear = new Map<number, number>();
  for (const d of divs) {
    if (d.date > at) continue;
    const year = new Date(d.date * 1000).getUTCFullYear();
    byYear.set(year, (byYear.get(year) ?? 0) + d.amount);
  }
  const atYear = new Date(at * 1000).getUTCFullYear();
  const completedYears = [...byYear.keys()].filter((y) => y < atYear);
  const endYear = completedYears.length > 0 ? Math.max(...completedYears) : null;

  const { avg, sd } = yieldStats(prices, divs, at);

  return {
    dividend_yield: r2(dividend_yield),
    dividend_growth_5y: r2(cagr(byYear, endYear, 5)),
    dividend_growth_1y: r2(cagr(byYear, endYear, 1)),
    yield_avg_5y: r2(avg),
    yield_sd_5y: r2(sd),
    price_change_12m: r2(price_change_12m),
    price,
  };
}

/** 야후 8년치 차트 응답에서 종가 시계열과 배당 이벤트를 뽑는다. */
export function parseChart(result: unknown): { prices: PricePoint[]; divs: DividendEvent[] } {
  const r = result as {
    timestamp?: number[];
    indicators?: { quote?: { close?: (number | null)[] }[] };
    events?: { dividends?: Record<string, DividendEvent> };
  };
  const timestamps = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  return {
    prices: timestamps.flatMap((t, i) =>
      typeof closes[i] === "number" ? [{ t, c: closes[i] as number }] : []
    ),
    divs: Object.values(r?.events?.dividends ?? {}),
  };
}

export async function fetchChart(ticker: string): Promise<unknown | null> {
  const res = await fetch(QUOTE_URL(ticker), {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  return (await res.json())?.chart?.result?.[0];
}

async function fetchOne(ticker: string): Promise<[string, DividendRates] | null> {
  try {
    const result = await fetchChart(ticker);
    const price = (result as { meta?: { regularMarketPrice?: number } })?.meta?.regularMarketPrice;
    if (typeof price !== "number" || price <= 0) return null;

    const { prices, divs } = parseChart(result);
    return [ticker, deriveRates(prices, divs, Date.now() / 1000, price)];
  } catch {
    return null;
  }
}

/**
 * 야후 배당 이력에서 수익률·성장률·수익률 변동폭을 직접 계산한다(손입력 데이터 대체).
 * 응답 자체를 못 받은 종목만 결과에서 빠지고, 받았지만 일부 값이 없는 종목은
 * 해당 필드가 null인 채로 들어온다 — 호출부가 DB 값으로 폴백해야 한다.
 */
export async function fetchDividendRates(tickers: string[]): Promise<Record<string, DividendRates>> {
  const unique = [...new Set(tickers)];
  const results = await mapLimit(unique, YAHOO_CONCURRENCY, fetchOne);
  return Object.fromEntries(results.filter((r): r is [string, DividendRates] => r !== null));
}
