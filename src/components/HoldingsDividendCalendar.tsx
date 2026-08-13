import { formatUsd } from "./DividendChart";
import { estimatedPerPayout, type EstimateCatalogStock, type EstimateReceipt } from "@/lib/holdingsDividendEstimate";

type Holding = { ticker: string; name: string; marketValue: number };

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// 종목마다 다른 색을 줘야 어느 달에 어떤 종목이 들어오는지 눈으로 구분된다
const ROW_COLORS = [
  "bg-secondary-container",
  "bg-sky-200",
  "bg-amber-200",
  "bg-violet-200",
  "bg-rose-200",
  "bg-cyan-200",
  "bg-orange-200",
  "bg-indigo-200",
  "bg-lime-200",
  "bg-pink-200",
];

export default function HoldingsDividendCalendar({
  holdings,
  catalog,
  receipts,
}: {
  holdings: Holding[];
  catalog: Record<string, EstimateCatalogStock>;
  receipts: EstimateReceipt[];
}) {
  const now = new Date();
  const usable = holdings
    .map((h) => ({ ...h, stock: catalog[h.ticker] }))
    .filter((h): h is Holding & { stock: EstimateCatalogStock } => !!h.stock);

  if (usable.length === 0) {
    return (
      <p className="text-body-md font-body-md text-on-surface-variant">
        배당 지급월 정보가 있는 보유 종목이 없어요.
      </p>
    );
  }

  const perPayout = (h: Holding & { stock: EstimateCatalogStock }) =>
    estimatedPerPayout(h.ticker, h.marketValue, h.stock, receipts, now);

  const monthTotals = MONTHS.map((m) =>
    usable.reduce((sum, h) => (h.stock.payout_months.includes(m) ? sum + perPayout(h) : sum), 0),
  );
  const emptyMonths = MONTHS.filter((m) => monthTotals[m - 1] === 0);

  return (
    <div>
      <h2 className="text-body-md font-bold text-primary">
        배당지급월{" "}
        <span className="font-normal text-on-surface-variant">(내 보유 종목 기준, 세후 실측 추정)</span>
      </h2>
      <p className="mt-stack-sm text-label-md font-label-md text-on-surface-variant">
        {emptyMonths.length === 0
          ? "1월부터 12월까지 매달 배당금이 들어와요."
          : `아직 배당이 없는 달: ${emptyMonths.join("·")}월`}
      </p>

      <div className="mt-stack-md overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-center text-label-md font-label-md">
          <thead>
            <tr>
              <th className="border border-outline-variant px-2 py-2 text-left font-bold text-on-surface">
                종목
              </th>
              {MONTHS.map((m) => (
                <th key={m} className="border border-outline-variant px-1 py-2 font-bold text-on-surface">
                  {m}월
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usable.map((h, i) => (
              <tr key={h.ticker}>
                <td className="border border-outline-variant px-2 py-2 text-left font-bold text-primary">
                  {h.name} <span className="font-normal text-on-surface-variant">({h.ticker})</span>
                </td>
                {MONTHS.map((m) => (
                  <td
                    key={m}
                    className={`border border-outline-variant px-1 py-2 ${
                      h.stock.payout_months.includes(m) ? ROW_COLORS[i % ROW_COLORS.length] : ""
                    }`}
                  >
                    {h.stock.payout_months.includes(m) ? formatUsd(perPayout(h)) : ""}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-surface-container font-bold">
              <td className="border border-outline-variant px-2 py-2 text-left text-on-surface">
                월 합계
              </td>
              {monthTotals.map((t, i) => (
                <td
                  key={i}
                  className={`border border-outline-variant px-1 py-2 ${
                    t === 0 ? "text-outline" : "text-on-surface"
                  }`}
                >
                  {t === 0 ? "—" : formatUsd(t)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-stack-sm text-label-md font-label-md text-outline">
        최근 1년 실제 배당 기록이 있는 종목은 그 평균 지급액, 기록이 없는 종목은 배당수익률로
        추정한 금액이에요. 실제 지급일은 종목·분기마다 달라요.
      </p>
    </div>
  );
}
