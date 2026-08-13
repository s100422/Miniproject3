export type EstimateReceipt = { ticker: string; amount: number; received_date: string };
export type EstimateCatalogStock = { dividend_yield: number; payout_months: number[] };

const WITHHOLDING_TAX_RATE = 0.15; // 배당 기록은 전부 세후 금액이라, 추정치도 세후로 통일한다
const TRAILING_WINDOW_DAYS = 365;

function paymentsPerYear(catalogStock: EstimateCatalogStock | undefined): number {
  return catalogStock?.payout_months.length || 4;
}

function receiptsInWindow(ticker: string, receipts: EstimateReceipt[], now: Date) {
  return receipts.filter(
    (r) => r.ticker === ticker && (now.getTime() - new Date(r.received_date).getTime()) / 86_400_000 <= TRAILING_WINDOW_DAYS,
  );
}

/**
 * 종목 하나의 "1회 지급당 예상 금액(세후, 지금 보유수량 기준)". 최근 1년 안에 실제 지급 기록이
 * 있으면 그 평균을 그대로 쓰고(중간에 빠뜨린 달이 있어도 평균으로 보정된다), 기록이 아예 없는
 * 종목(막 편입했거나 배당 기록을 안 남긴 경우)만 카탈로그 배당수익률로 추정한다.
 */
export function estimatedPerPayout(
  ticker: string,
  marketValue: number,
  catalogStock: EstimateCatalogStock | undefined,
  receipts: EstimateReceipt[],
  now: Date,
): number {
  const windowReceipts = receiptsInWindow(ticker, receipts, now);
  if (windowReceipts.length > 0) {
    return windowReceipts.reduce((s, r) => s + r.amount, 0) / windowReceipts.length;
  }
  if (!catalogStock) return 0;
  return (marketValue * (catalogStock.dividend_yield / 100) * (1 - WITHHOLDING_TAX_RATE)) / paymentsPerYear(catalogStock);
}

export function estimatedAnnualDividend(
  ticker: string,
  marketValue: number,
  catalogStock: EstimateCatalogStock | undefined,
  receipts: EstimateReceipt[],
  now: Date,
): number {
  return estimatedPerPayout(ticker, marketValue, catalogStock, receipts, now) * paymentsPerYear(catalogStock);
}
