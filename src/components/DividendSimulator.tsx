import { goalReachYear, type YearlyProjection } from "@/lib/dividendCalc";
import DividendChart, { formatUsd } from "./DividendChart";

type Allocation = { weight_pct: number; dividend_growth_5y?: number };

export default function DividendSimulator({
  chartData,
  allocations,
  targetMonthlyDividend,
}: {
  chartData: YearlyProjection[];
  allocations: Allocation[];
  targetMonthlyDividend: number;
}) {
  const goalAnnual = targetMonthlyDividend * 12;
  const reachYear = goalReachYear(chartData, goalAnnual);
  const last = chartData[chartData.length - 1];
  const reinvestMultiple = last.growth > 0 ? last.growthReinvest / last.growth : 1;
  const hasGrowthRates = allocations.every((a) => a.dividend_growth_5y != null);
  const growthRate = allocations.reduce(
    (sum, a) => sum + (a.weight_pct / 100) * (a.dividend_growth_5y ?? 0),
    0
  );

  return (
    <div>
      <h2 className="text-body-lg font-headline-md font-bold text-primary">
        배당성장률 적용 시나리오{" "}
        <span className="text-label-md font-label-md font-normal text-on-surface-variant">
          (연간, 세전)
        </span>
      </h2>
      {hasGrowthRates && (
        <p className="mt-stack-sm text-label-md font-label-md text-on-surface-variant">
          이 포트폴리오의 평균 배당성장률{" "}
          <span className="font-bold text-secondary">{growthRate.toFixed(2)}%</span>를 매년 적용했을
          때의 예상 금액이에요.
        </p>
      )}

      <div className="mt-stack-md overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-right text-label-md font-label-md">
          <thead>
            <tr>
              <th className="border border-outline-variant px-2 py-2 text-left font-bold text-on-surface">
                시나리오
              </th>
              {chartData.map((d) => (
                <th
                  key={d.year}
                  className="border border-outline-variant px-2 py-2 font-bold text-on-surface"
                >
                  {d.year}년차
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-outline-variant px-2 py-2 text-left text-on-surface-variant">
                배당성장
              </td>
              {chartData.map((d) => (
                <td
                  key={d.year}
                  className="border border-outline-variant px-2 py-2 text-on-surface-variant"
                >
                  {formatUsd(d.growth)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-outline-variant px-2 py-2 text-left font-bold text-on-surface">
                배당성장 + 배당재투자
              </td>
              {chartData.map((d) => (
                <td
                  key={d.year}
                  className={`border border-outline-variant px-2 py-2 font-bold ${
                    d.growthReinvest >= goalAnnual ? "text-error" : "text-on-surface"
                  }`}
                >
                  {formatUsd(d.growthReinvest)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-stack-sm text-label-md font-label-md text-on-surface-variant">
        목표 월 {formatUsd(targetMonthlyDividend)} = 연 {formatUsd(goalAnnual)} ·{" "}
        {reachYear ? (
          <span className="font-bold text-error">
            재투자까지 하면 약 {Math.round(reachYear)}년차에 도달해요
          </span>
        ) : (
          <span className="font-bold text-error">지금 투자금으로는 30년차까지도 목표에 못 미쳐요</span>
        )}
      </p>

      <details className="group mt-stack-lg rounded-xl border border-secondary-container bg-secondary-container/40 p-stack-md">
        <summary className="flex cursor-pointer list-none items-center justify-between text-label-md font-label-md font-bold text-primary">
          배당 재투자를 왜 할까요?
          <span className="material-symbols-outlined text-base text-on-surface-variant transition-transform group-open:rotate-180">
            expand_more
          </span>
        </summary>
        <p className="mt-stack-sm text-label-md font-label-md leading-relaxed text-on-surface-variant">
          받은 배당금을 쓰지 않고 같은 배당주를 더 사두면, 다음 배당은 늘어난 주식 수만큼 더
          들어와요. 그 배당으로 또 주식을 사고, 그게 다시 배당을 늘리고 — 이렇게{" "}
          <strong className="text-secondary">배당이 배당을 낳는 것</strong>이 복리 효과예요. 원금(월
          투자금)은 그대로인데 시간이 지날수록 차이가 벌어지는 이유죠.
        </p>
        <p className="mt-stack-sm text-label-md font-label-md leading-relaxed text-on-surface-variant">
          위 표의 {last.year}년차를 보면, 배당금을 그때그때 써버렸을 때는 {formatUsd(last.growth)}
          지만 재투자했을 때는 {formatUsd(last.growthReinvest)}로{" "}
          <strong className="text-secondary">약 {reinvestMultiple.toFixed(1)}배</strong> 차이가 나요.
          목표까지 남은 기간이 길수록 이 차이는 더 커져요.
        </p>
        <p className="mt-stack-sm text-label-md font-label-md leading-relaxed text-on-surface-variant">
          다만 배당금을 여행비로 꺼내 쓰기 시작하면 재투자가 멈추고 복리도 같이 멈춰요. 목표에
          도달할 때까지는 재투자하고, 도달한 뒤부터 꺼내 쓰는 식으로 나누는 걸 추천해요.
        </p>
      </details>

      <div className="mt-6">
        <DividendChart data={chartData} goalAnnual={goalAnnual} />
      </div>
    </div>
  );
}
