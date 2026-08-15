import { supabase } from "./supabase";

/**
 * 야간 배치가 채워둔 종목 점수를 읽는다. **화면은 야후를 직접 부르지 않는다** —
 * 분석 대상이 사용자가 아니라 종목이라 결과를 전 사용자가 공유한다(docs/ROADMAP.md).
 */

export type TickerAnalysis = {
  ticker: string;
  as_of: string;
  total_score: number | null;
  safety_score: number | null;
  growth_score: number | null;
  strength_score: number | null;
  value_score: number | null;
  dividend_yield: number | null;
  dividend_growth_5y: number | null;
  price: number | null;
  status: "ok" | "partial" | "failed";
  metrics: {
    flags?: string[];
    payout_ocf?: number | null;
    payout_band?: { good: number; warn: number; bad: number };
    net_debt_to_ebitda?: number | null;
    interest_coverage?: number | null;
    fundamentals_as_of?: string | null;
  };
};

/** 마지막 성공 배치가 이만큼 낡으면 화면에 경고 배너를 띄운다(로드맵 85줄). */
export const STALE_DAYS = 3;

export type AnalysisSnapshot = {
  asOf: string | null;
  byTicker: Record<string, TickerAnalysis>;
};

/**
 * 마지막 배치 회차의 날짜. `ticker_analysis`는 덮어쓰지 않고 쌓이므로 전체를 가져오면
 * 시간이 갈수록 커진다 — 항상 최신 회차만 골라 읽는다.
 */
async function latestAsOf(): Promise<string | null> {
  const { data } = await supabase
    .from("ticker_analysis")
    .select("as_of")
    .order("as_of", { ascending: false })
    .limit(1);
  return data?.[0]?.as_of ?? null;
}

/** 최신 회차 한 벌. 화면이 배지·플래그·원지표까지 다 쓸 때. */
export async function fetchLatestAnalysis(): Promise<AnalysisSnapshot> {
  const asOf = await latestAsOf();
  if (!asOf) return { asOf: null, byTicker: {} };

  const { data } = await supabase.from("ticker_analysis").select("*").eq("as_of", asOf);
  const byTicker: Record<string, TickerAnalysis> = {};
  for (const row of (data ?? []) as TickerAnalysis[]) byTicker[row.ticker] = row;
  return { asOf, byTicker };
}

export type PrecomputedRates = {
  dividend_yield: number | null;
  dividend_growth_5y: number | null;
};

/**
 * 플랜 계산에 필요한 두 값만. `fetchDividendRates`의 드롭인 대체다 —
 * 야후에 86건을 던지는 대신 배치가 계산해둔 값을 읽는다. `metrics` jsonb까지
 * 끌고 오지 않으려고 컬럼을 좁혔다.
 */
export async function fetchPrecomputedRates(): Promise<Record<string, PrecomputedRates>> {
  const asOf = await latestAsOf();
  if (!asOf) return {};

  const { data } = await supabase
    .from("ticker_analysis")
    .select("ticker, dividend_yield, dividend_growth_5y")
    .eq("as_of", asOf);

  return Object.fromEntries(
    (data ?? []).map((r) => [
      r.ticker as string,
      {
        dividend_yield: r.dividend_yield as number | null,
        dividend_growth_5y: r.dividend_growth_5y as number | null,
      },
    ])
  );
}

/** 기준일이 며칠 지났나. as_of는 UTC 날짜라 한국에선 늘 하루 앞선 것처럼 보인다. */
export function daysSince(asOf: string | null): number | null {
  if (!asOf) return null;
  const then = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export const FLAG_LABEL: Record<string, string> = {
  dividend_trap: "배당함정 의심",
  financial_stress: "재무 부담",
  payout_warning: "배당성향 경고선 초과",
  growth_deceleration: "배당 성장 둔화",
};
