import { formatUsd } from "./DividendChart";

type Allocation = {
  ticker: string;
  name: string;
  weight_pct: number;
  dividend_yield?: number;
  payout_months?: number[];
};

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

export default function DividendCalendar({
  allocations,
  monthlyInvestment,
}: {
  allocations: Allocation[];
  monthlyInvestment: number;
}) {
  const usable = allocations.filter((a) => a.payout_months && a.dividend_yield != null);
  if (usable.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        이 플랜에는 배당 지급월 정보가 없어요. 플랜을 새로 만들면 표시됩니다.
      </p>
    );
  }

  // 1년차 기준: 연 투자금 × 비중 × 배당수익률을 지급 횟수로 나눠 한 번에 들어오는 금액을 구한다
  const perPayout = (a: Allocation) =>
    (monthlyInvestment * 12 * (a.weight_pct / 100) * (a.dividend_yield! / 100)) /
    a.payout_months!.length;

  const monthTotals = MONTHS.map((m) =>
    usable.reduce((sum, a) => (a.payout_months!.includes(m) ? sum + perPayout(a) : sum), 0)
  );
  const emptyMonths = MONTHS.filter((m) => monthTotals[m - 1] === 0);

  return (
    <div>
      <h2 className="text-sm font-semibold text-primary">
        배당지급월{" "}
        <span className="font-normal text-slate-500">
          (월 {formatUsd(monthlyInvestment)} 투자 기준 예상)
        </span>
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {emptyMonths.length === 0
          ? "1월부터 12월까지 매달 배당금이 들어오도록 구성된 플랜이에요."
          : `아직 배당이 없는 달: ${emptyMonths.join("·")}월`}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-center text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="border border-slate-200 px-2 py-2 text-left font-medium text-slate-700">
                종목
              </th>
              {MONTHS.map((m) => (
                <th key={m} className="border border-slate-200 px-1 py-2 font-medium text-slate-700">
                  {m}월
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usable.map((a, i) => (
              <tr key={a.ticker}>
                <td className="border border-slate-200 px-2 py-2 text-left font-medium text-primary">
                  {a.name} <span className="text-on-secondary-container">({a.ticker})</span>
                </td>
                {MONTHS.map((m) => (
                  <td
                    key={m}
                    className={`border border-slate-200 px-1 py-2 ${
                      a.payout_months!.includes(m) ? ROW_COLORS[i % ROW_COLORS.length] : ""
                    }`}
                  >
                    {a.payout_months!.includes(m) ? formatUsd(perPayout(a)) : ""}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-slate-50 font-medium">
              <td className="border border-slate-200 px-2 py-2 text-left text-slate-800">
                월 합계
              </td>
              {monthTotals.map((t, i) => (
                <td
                  key={i}
                  className={`border border-slate-200 px-1 py-2 ${
                    t === 0 ? "text-slate-300" : "text-on-secondary-container"
                  }`}
                >
                  {t === 0 ? "—" : formatUsd(t)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        실제 지급일은 종목·분기마다 달라요. 여기서는 지급되는 &lsquo;달&rsquo;만 보여줍니다.
      </p>
    </div>
  );
}
