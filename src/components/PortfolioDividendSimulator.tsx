"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/components/DividendChart";
import { weightedRate, type StockRates } from "@/lib/dividendCalc";
import { estimatedAnnualDividend, type EstimateReceipt } from "@/lib/holdingsDividendEstimate";

const WITHHOLDING_TAX_RATE = 0.15; // 배당 기록은 전부 세후 금액이라, 추정치도 세후로 통일한다
const YEARS = 20;
const HOLD_ONLY_COLOR = "#14b8a6";
const WITH_CONTRIBUTION_COLOR = "#ec4899";

type SimHolding = { ticker: string; marketValue: number };
type SimAllocation = { ticker: string; weight_pct: number };
type SimCatalogStock = StockRates & { payout_months: number[] };
type SimReceipt = EstimateReceipt;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function currentAnnualDividend(
  holdings: SimHolding[],
  catalog: Record<string, SimCatalogStock>,
  receipts: SimReceipt[],
  now: Date,
): number {
  return holdings.reduce(
    (sum, h) => sum + estimatedAnnualDividend(h.ticker, h.marketValue, catalog[h.ticker], receipts, now),
    0,
  );
}

export default function PortfolioDividendSimulator({
  holdings,
  allocations,
  catalog,
  receipts,
}: {
  holdings: SimHolding[];
  allocations: SimAllocation[];
  catalog: Record<string, SimCatalogStock>;
  receipts: SimReceipt[];
}) {
  const [monthlyInput, setMonthlyInput] = useState("");
  const monthlyContribution = Number(monthlyInput) || 0;

  const currentAnnual = useMemo(
    () => currentAnnualDividend(holdings, catalog, receipts, new Date()),
    [holdings, catalog, receipts],
  );

  const growthRate = weightedRate(allocations, catalog, "dividend_growth_5y");
  const yieldRateAfterTax = weightedRate(allocations, catalog, "dividend_yield") * (1 - WITHHOLDING_TAX_RATE);

  const rows = useMemo(() => {
    const annualContribution = monthlyContribution * 12;
    const out: { year: number; holdOnly: number; withContribution: number | null }[] = [];
    let holdOnly = currentAnnual;
    let withContribution = currentAnnual;
    for (let year = 1; year <= YEARS; year++) {
      holdOnly = holdOnly * (1 + growthRate + yieldRateAfterTax);
      withContribution =
        withContribution * (1 + growthRate + yieldRateAfterTax) + annualContribution * yieldRateAfterTax;
      out.push({
        year,
        holdOnly: round2(holdOnly),
        withContribution: monthlyContribution > 0 ? round2(withContribution) : null,
      });
    }
    return out;
  }, [currentAnnual, growthRate, yieldRateAfterTax, monthlyContribution]);

  const last = rows[rows.length - 1];

  if (holdings.length === 0) return null;

  return (
    <div>
      <div className="mb-stack-lg grid grid-cols-1 gap-stack-md sm:grid-cols-2">
        <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
          <p className="text-label-md font-label-md text-on-surface-variant">
            현재 연간 배당금 (세후, 실측 기준)
          </p>
          <p className="text-headline-md font-headline-md text-primary">
            {formatUsd(currentAnnual)}
          </p>
        </div>
        <div>
          <label
            className="mb-stack-sm block text-label-md font-label-md text-on-surface-variant"
            htmlFor="sim-monthly-contribution"
          >
            월 예정 투자금 ($, 선택)
          </label>
          <input
            id="sim-monthly-contribution"
            type="number"
            min="0"
            step="any"
            className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-body-md font-body-md transition-shadow focus:border-primary focus:ring-1 focus:ring-secondary focus:outline-none"
            value={monthlyInput}
            onChange={(e) => setMonthlyInput(e.target.value)}
            placeholder="지금 보유분만 볼 땐 비워두세요"
          />
        </div>
      </div>

      <div className="mb-stack-md flex flex-wrap gap-gutter text-label-md font-label-md text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: HOLD_ONLY_COLOR }} /> 지금 보유분만
          유지
        </span>
        {monthlyContribution > 0 && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 border-t border-dashed"
              style={{ borderColor: WITH_CONTRIBUTION_COLOR }}
            />{" "}
            월 {formatUsd(monthlyContribution)} 추가투자
          </span>
        )}
      </div>
      <p className="mb-stack-md text-label-md font-label-md text-on-surface-variant">
        두 시나리오 모두 받은 배당금은 같은 비중으로 재투자한다고 가정해요. 차이는 재투자 여부가 아니라
        매달 새 돈을 추가로 투입하는지예요.
      </p>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-surface-container)" vertical={false} />
            <XAxis
              dataKey="year"
              tickFormatter={(y) => `${y}년`}
              tick={{ fontSize: 11, fill: "var(--color-on-surface-variant)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatUsd}
              tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              formatter={(v: number) => formatUsd(v)}
              labelFormatter={(y) => `${y}년 후`}
            />
            <Line
              type="monotone"
              dataKey="holdOnly"
              stroke={HOLD_ONLY_COLOR}
              strokeWidth={2}
              dot={false}
            />
            {monthlyContribution > 0 && (
              <Line
                type="monotone"
                dataKey="withContribution"
                stroke={WITH_CONTRIBUTION_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-stack-sm text-label-md font-label-md text-on-surface-variant">
        {YEARS}년 후 예상 연간 배당금 — 지금 보유분만 유지: {formatUsd(last.holdOnly)}
        {monthlyContribution > 0 && last.withContribution != null &&
          ` · 월 ${formatUsd(monthlyContribution)} 추가투자 시: ${formatUsd(last.withContribution)}`}
        {" "}(배당 성장률은 카탈로그 평균치 추정이라 실제와 다를 수 있어요)
      </p>
    </div>
  );
}
