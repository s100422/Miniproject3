import { mapLimit, toQuoteSymbol, YAHOO_CONCURRENCY } from "./stockPrice";

/**
 * 야후 재무 시계열. 쿠키·크럼이 필요 없고(User-Agent만 붙이면 200) chart 엔드포인트와
 * 같은 방식이다. quoteSummary를 안 쓰는 이유는 docs/DATABASE.md 참고 —
 * cashflowStatementHistory가 endDate와 netIncome만 남기고 비어버렸다.
 *
 * 값은 전부 **연간(회계연도) 확정치**다. TTM보다 최대 1년 묵을 수 있는 대신 감사받은
 * 숫자이고 분기/TTM 기준이 섞이는 사고가 없다. asOfDate를 같이 저장해 화면에 노출한다.
 */

const TYPES = [
  "annualFreeCashFlow",
  "annualOperatingCashFlow",
  "annualCapitalExpenditure",
  "annualCashDividendsPaid",
  "annualNetIncome",
  "annualTotalRevenue",
  "annualOperatingIncome",
  "annualTotalDebt",
  "annualCashAndCashEquivalents",
  "annualEBITDA",
  "annualInterestExpense",
  "annualDilutedEPS",
] as const;

const TIMEOUT_MS = 10000;

const TIMESERIES_URL = (ticker: string) => {
  const sym = toQuoteSymbol(ticker);
  const end = Math.floor(Date.now() / 1000);
  // 6년치를 요청해 최신 회계연도와 직전 연도가 확실히 들어오게 한다(야후는 보통 4년을 준다).
  const start = end - 6 * 365 * 86400;
  return (
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}` +
    `?symbol=${encodeURIComponent(sym)}&type=${TYPES.join(",")}&period1=${start}&period2=${end}`
  );
};

export type Fundamentals = {
  /** 최신 회계연도 종료일(ISO). 이 재무 지표들이 언제 기준인지 화면에 노출할 값. */
  asOfDate: string | null;
  freeCashflow: number | null;
  /** 설비투자 차감 전. 유틸리티처럼 capex가 큰 섹터는 FCF 기준 배당성향이 왜곡돼서 같이 본다. */
  operatingCashflow: number | null;
  /** 설비투자액(양수). FCF 왜곡이 성장투자 때문인지 판단할 근거. */
  capex: number | null;
  /** 야후가 음수로 주지만 양수로 뒤집어 담는다. */
  dividendsPaid: number | null;
  netIncome: number | null;
  revenue: number | null;
  /** 직전 회계연도 매출. 매출 성장 계산용. */
  revenuePrev: number | null;
  operatingIncome: number | null;
  totalDebt: number | null;
  cash: number | null;
  /** 야후에 없는 값이라 totalDebt - cash로 직접 계산한다. */
  netDebt: number | null;
  ebitda: number | null;
  /** 이자보상배율 계산용. 야후가 음수로 주는 종목이 있어 양수로 통일한다. */
  interestExpense: number | null;
  dilutedEps: number | null;
  /** 값이 비어서 못 채운 지표 이름. 점수 모델이 status를 'partial'로 내릴 근거. */
  missing: string[];
};

export type FundamentalsResult =
  | { ok: true; data: Fundamentals }
  | { ok: false; error: string };

type Point = { asOfDate?: string; reportedValue?: { raw?: number } } | null;
type SeriesEntry = Record<string, Point[] | unknown>;

/**
 * 지표별 시계열을 오래된 것부터 정렬해 돌려준다. 야후는 배열에 null을 섞어 보낸다.
 * `cutoff`(ISO 날짜)를 주면 그 이후 회계연도는 버린다 — 과거 시점 검증용.
 */
function series(
  result: SeriesEntry[],
  type: string,
  cutoff?: string
): { date: string; value: number }[] {
  const entry = result.find((r) => Array.isArray(r[type]));
  const points = (entry?.[type] as Point[] | undefined) ?? [];
  return points
    .flatMap((p) => {
      const value = p?.reportedValue?.raw;
      return p?.asOfDate && typeof value === "number" && Number.isFinite(value)
        ? [{ date: p.asOfDate, value }]
        : [];
    })
    .filter((p) => cutoff == null || p.date <= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parse(result: SeriesEntry[], cutoff?: string): Fundamentals {
  const latest = (type: string) => series(result, type, cutoff).at(-1) ?? null;
  const value = (type: string) => latest(type)?.value ?? null;
  const abs = (n: number | null) => (n != null ? Math.abs(n) : null);

  // 야후가 FreeCashFlow를 안 주는 종목이 있어서 영업현금흐름 - capex로 복구한다.
  // capex 부호 관례를 믿지 않고 절댓값으로 뺀다.
  const operatingCashflow = value("annualOperatingCashFlow");
  const capex = abs(value("annualCapitalExpenditure"));
  const freeCashflow =
    value("annualFreeCashFlow") ??
    (operatingCashflow != null && capex != null ? operatingCashflow - capex : null);

  const totalDebt = value("annualTotalDebt");
  const cash = value("annualCashAndCashEquivalents");
  const revenues = series(result, "annualTotalRevenue", cutoff);

  const data: Fundamentals = {
    asOfDate: latest("annualFreeCashFlow")?.date ?? latest("annualTotalRevenue")?.date ?? null,
    freeCashflow,
    operatingCashflow,
    capex,
    dividendsPaid: abs(value("annualCashDividendsPaid")),
    netIncome: value("annualNetIncome"),
    revenue: revenues.at(-1)?.value ?? null,
    revenuePrev: revenues.at(-2)?.value ?? null,
    operatingIncome: value("annualOperatingIncome"),
    totalDebt,
    cash,
    netDebt: totalDebt != null && cash != null ? totalDebt - cash : null,
    ebitda: value("annualEBITDA"),
    interestExpense: abs(value("annualInterestExpense")),
    dilutedEps: value("annualDilutedEPS"),
    missing: [],
  };

  data.missing = (Object.keys(data) as (keyof Fundamentals)[]).filter(
    (k) => k !== "missing" && data[k] == null
  );
  return data;
}

async function fetchOne(ticker: string, cutoff?: string): Promise<[string, FundamentalsResult]> {
  try {
    const res = await fetch(TIMESERIES_URL(ticker), {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json();

    // 실패해도 200에 에러 봉투가 실려 오는 경우가 있다. 봉투를 확인하지 않으면 "값이 빈
    // 종목"처럼 조용히 흘러가서 점수가 조용히 틀린다.
    const error = body?.timeseries?.error ?? body?.finance?.error;
    if (error) return [ticker, { ok: false, error: `${error.code ?? res.status}: ${error.description ?? ""}` }];
    if (!res.ok) return [ticker, { ok: false, error: `HTTP ${res.status}` }];

    const result = body?.timeseries?.result;
    if (!Array.isArray(result) || result.length === 0)
      return [ticker, { ok: false, error: "빈 응답" }];

    return [ticker, { ok: true, data: parse(result, cutoff) }];
  } catch (e) {
    return [ticker, { ok: false, error: e instanceof Error ? e.message : String(e) }];
  }
}

/**
 * 티커별 재무 지표. 다른 야후 페처와 달리 **실패를 조용히 삼키지 않는다** —
 * 실패한 종목도 사유와 함께 돌려줘서 호출부가 '미분석'으로 기록할 수 있게 한다
 * (조용히 빼면 위험 노출도 계산이 틀린다).
 */
export async function fetchFundamentals(
  tickers: string[],
  /** ISO 날짜. 주면 그 시점까지 공시된 회계연도만 쓴다 — 과거 시점 검증용. */
  cutoff?: string
): Promise<Record<string, FundamentalsResult>> {
  const unique = [...new Set(tickers)];
  const results = await mapLimit(unique, YAHOO_CONCURRENCY, (t) => fetchOne(t, cutoff));
  return Object.fromEntries(results);
}
