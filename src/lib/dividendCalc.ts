export type Allocation = { ticker: string; weight_pct: number };
export type StockRates = { dividend_yield: number; dividend_growth_5y: number };

const DEFAULT_INFLATION_RATE = 0.03;
export const MILESTONE_YEARS = [1, 5, 10, 15, 20];

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
