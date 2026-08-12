export type HoldingTransaction = {
  ticker: string;
  name: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  trade_date: string;
  broker?: string | null;
};

export type Holding = {
  ticker: string;
  name: string;
  quantity: number;
  avgPrice: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 거래 내역에서 종목별 보유수량·평단가를 이동평균법으로 계산한다(국내 증권사와 동일 방식).
 * 매도는 수량만 줄이고 평단가는 그대로 유지한다 — 남은 주식의 매입원가가 바뀌지 않아서다.
 */
export function aggregateHoldings(transactions: HoldingTransaction[]): Holding[] {
  const sorted = [...transactions].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const byTicker = new Map<string, { name: string; quantity: number; totalCost: number }>();

  for (const t of sorted) {
    const entry = byTicker.get(t.ticker) ?? { name: t.name, quantity: 0, totalCost: 0 };
    if (t.type === "buy") {
      entry.quantity += t.quantity;
      entry.totalCost += t.quantity * t.price;
    } else {
      const avgPrice = entry.quantity > 0 ? entry.totalCost / entry.quantity : 0;
      entry.quantity -= t.quantity;
      entry.totalCost -= t.quantity * avgPrice;
    }
    entry.name = t.name;
    byTicker.set(t.ticker, entry);
  }

  return [...byTicker.entries()]
    .filter(([, e]) => e.quantity > 1e-9)
    .map(([ticker, e]) => ({
      ticker,
      name: e.name,
      quantity: round2(e.quantity),
      avgPrice: round2(e.totalCost / e.quantity),
    }));
}
