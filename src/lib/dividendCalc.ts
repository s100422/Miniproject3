export type Allocation = { ticker: string; weight_pct: number };
export type StockRates = { dividend_yield: number; dividend_growth_5y: number };

const DEFAULT_INFLATION_RATE = 0.03;
export const MILESTONE_YEARS = [1, 5, 10, 15, 20, 25, 30];

function weightedRate(
  allocations: Allocation[],
  stocks: Record<string, StockRates>,
  field: keyof StockRates
): number {
  return allocations.reduce((sum, a) => {
    const stock = stocks[a.ticker];
    return stock ? sum + (a.weight_pct / 100) * (stock[field] / 100) : sum;
  }, 0);
}

export function presentValue(
  futureAmount: number,
  years: number,
  inflationRate = DEFAULT_INFLATION_RATE
): number {
  return futureAmount / Math.pow(1 + inflationRate, years);
}

export type YearlyProjection = {
  year: number;
  base: number;
  growth: number;
  growthReinvest: number;
  growthReinvestReal: number;
};

export function projectDividendGrowth(
  allocations: Allocation[],
  stocks: Record<string, StockRates>,
  monthlyInvestment: number,
  periodMonths: number,
  inflationRate = DEFAULT_INFLATION_RATE
): YearlyProjection[] {
  const yieldRate = weightedRate(allocations, stocks, "dividend_yield");
  const growthRate = weightedRate(allocations, stocks, "dividend_growth_5y");
  const annualContribution = monthlyInvestment * 12;
  const years = Math.ceil(periodMonths / 12);

  const rows: YearlyProjection[] = [];
  let growth = 0;
  let growthReinvest = 0;

  for (let year = 1; year <= years; year++) {
    growth = growth * (1 + growthRate) + annualContribution * yieldRate;
    growthReinvest =
      growthReinvest * (1 + growthRate + yieldRate) + annualContribution * yieldRate;
    const base = annualContribution * year * yieldRate;

    rows.push({
      year,
      base: round2(base),
      growth: round2(growth),
      growthReinvest: round2(growthReinvest),
      growthReinvestReal: round2(presentValue(growthReinvest, year, inflationRate)),
    });
  }
  return rows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PortfolioStock = StockRates & {
  ticker: string;
  payout_months: number[];
  sector: string;
};

const PORTFOLIO_SIZE = 8;
// AI 프롬프트 규칙(같은 섹터 weight_pct 합 40% 이하)과 맞춘 상한. 이 상한 계산이
// 섹터 제약을 무시하면 AI가 실제로 못 만들 조합을 "현실적"이라고 안내하게 된다.
const MAX_PER_SECTOR = Math.floor(PORTFOLIO_SIZE * 0.4);

/** 점수 상위 종목을 고르되, 빠진 달이 있으면 그 달을 주는 종목을 채워 12개월을 커버한다 */
function pickPortfolio(
  stocks: PortfolioStock[],
  score: (s: PortfolioStock) => number
): PortfolioStock[] {
  const sorted = [...stocks].sort((a, b) => score(b) - score(a));
  const sectorCount = new Map<string, number>();
  const picked: PortfolioStock[] = [];

  for (const s of sorted) {
    if (picked.length >= PORTFOLIO_SIZE) break;
    const count = sectorCount.get(s.sector) ?? 0;
    if (count >= MAX_PER_SECTOR) continue;
    picked.push(s);
    sectorCount.set(s.sector, count + 1);
  }

  const covered = new Set(picked.flatMap((s) => s.payout_months));
  for (let month = 1; month <= 12; month++) {
    if (covered.has(month)) continue;
    // 섹터 상한을 지키는 종목을 우선 채우고, 그래도 커버가 안 되면 12개월 커버리지
    // 규칙(항상 우선)을 위해 상한을 넘겨서라도 채운다
    const fill =
      sorted.find(
        (s) =>
          s.payout_months.includes(month) &&
          !picked.includes(s) &&
          (sectorCount.get(s.sector) ?? 0) < MAX_PER_SECTOR
      ) ?? sorted.find((s) => s.payout_months.includes(month) && !picked.includes(s));
    if (fill) {
      picked.push(fill);
      sectorCount.set(fill.sector, (sectorCount.get(fill.sector) ?? 0) + 1);
      fill.payout_months.forEach((m) => covered.add(m));
    }
  }
  return picked;
}

function finalAnnual(
  picked: PortfolioStock[],
  monthlyInvestment: number,
  periodMonths: number
): number {
  if (picked.length === 0) return 0;
  const weight = 100 / picked.length;
  const rows = projectDividendGrowth(
    picked.map((s) => ({ ticker: s.ticker, weight_pct: weight })),
    Object.fromEntries(picked.map((s) => [s.ticker, s])),
    monthlyInvestment,
    periodMonths
  );
  return rows[rows.length - 1].growthReinvest;
}

/**
 * AI가 실제로 만들 법한 최선의 포트폴리오(상위 종목 균등 분산, 12개월 커버) 기준 30년 후 연간 배당금.
 * 한 종목에 100% 몰아넣은 이론적 상한은 현실과 10배 가까이 벌어져서 차단 기준으로 쓸 수 없다.
 * 고배당 위주와 총수익(배당+성장) 위주 중 나은 쪽을 택한다.
 */
export function realisticBestAnnualDividend(
  stocks: PortfolioStock[],
  monthlyInvestment: number,
  periodMonths = 360
): number {
  return Math.max(
    finalAnnual(pickPortfolio(stocks, (s) => s.dividend_yield), monthlyInvestment, periodMonths),
    finalAnnual(
      pickPortfolio(stocks, (s) => s.dividend_yield + s.dividend_growth_5y),
      monthlyInvestment,
      periodMonths
    )
  );
}

/**
 * 목표 배당금(연 환산)에 도달하는 시점을 추정한다. 저장된 데이터가 마일스톤(1·5·10…년차)뿐이라
 * 그 사이 값은 보간해야 한다. 도달하지 못하면 null.
 */
export function goalReachYear(
  rows: YearlyProjection[],
  goalAnnual: number
): number | null {
  const idx = rows.findIndex((r) => r.growthReinvest >= goalAnnual);
  if (idx === -1) return null;
  if (idx === 0) return rows[0].year;

  const prev = rows[idx - 1];
  const curr = rows[idx];
  if (prev.growthReinvest <= 0 || curr.growthReinvest <= prev.growthReinvest) return curr.year;

  // 배당금은 복리로 늘어나므로 직선보다 로그(기하) 보간이 실제 곡선에 가깝다
  const t =
    Math.log(goalAnnual / prev.growthReinvest) /
    Math.log(curr.growthReinvest / prev.growthReinvest);
  return prev.year + t * (curr.year - prev.year);
}
