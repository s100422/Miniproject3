"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/components/DividendChart";
import { Select } from "@/components/ui/select";

type Receipt = { received_date: string; amount: number; name: string };
type MonthDatum = { month: number; amount: number; items: { name: string; amount: number }[] };

const COLOR_SCHEME = [
  "#5B14C5",
  "#9152EE",
  "#40E5D1",
  "#A840E8",
  "#4C86FF",
  "#0D4ED2",
  "#40D3F4",
];

/** reaviz의 Bar glow 옵션과 같은 느낌: 실제 막대 뒤에 같은 색을 블러 처리해 깐 겹쳐 그린다. */
function GlowBar(props: { x?: number; y?: number; width?: number; height?: number; fill?: string }) {
  const { x, y, width, height, fill } = props;
  if (x == null || y == null || !width || !height) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        fillOpacity={0.6}
        filter="url(#dividendBarGlow)"
      />
      <rect x={x} y={y} width={width} height={height} fill={fill} />
    </g>
  );
}

function MonthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: MonthDatum }[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  const { amount, items } = payload[0].payload;

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-label-md font-label-md shadow-md">
      <p className="font-bold text-on-surface">{label}월</p>
      {items.length === 0 ? (
        <p className="mt-stack-sm text-on-surface-variant">배당 없음</p>
      ) : (
        items.map((item) => (
          <p key={item.name} className="mt-stack-sm text-on-surface-variant">
            {item.name}: <span className="font-medium text-on-surface">{formatUsd(item.amount)}</span>
          </p>
        ))
      )}
      <p className="mt-stack-sm font-bold text-primary">총 금액: {formatUsd(amount)}</p>
    </div>
  );
}

function totalForYear(receipts: Receipt[], year: number) {
  return receipts
    .filter((r) => Number(r.received_date.slice(0, 4)) === year)
    .reduce((sum, r) => sum + r.amount, 0);
}

function totalForYearThroughMonth(receipts: Receipt[], year: number, month: number) {
  return receipts
    .filter((r) => {
      const [y, m] = r.received_date.split("-").map(Number);
      return y === year && m <= month;
    })
    .reduce((sum, r) => sum + r.amount, 0);
}

export default function MonthlyDividendChart({ receipts }: { receipts: Receipt[] }) {
  const years = useMemo(() => {
    const set = new Set(receipts.map((r) => Number(r.received_date.slice(0, 4))));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [receipts]);

  const [year, setYear] = useState(years[0]);
  const selectedYear = years.includes(year) ? year : years[0];

  const data = useMemo<MonthDatum[]>(() => {
    const months: MonthDatum[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      amount: 0,
      items: [],
    }));
    for (const r of receipts) {
      const [y, m] = r.received_date.split("-").map(Number);
      if (y !== selectedYear) continue;
      const bucket = months[m - 1];
      bucket.amount += r.amount;
      const existing = bucket.items.find((item) => item.name === r.name);
      if (existing) existing.amount += r.amount;
      else bucket.items.push({ name: r.name, amount: r.amount });
    }
    return months;
  }, [receipts, selectedYear]);

  const now = new Date();
  const isOngoingYear = selectedYear === now.getFullYear();
  // 진행 중인 연도는 전년도 전체가 아니라 "같은 달까지"만 비교해야 공정한 대비가 된다.
  const monthsElapsed = isOngoingYear ? now.getMonth() + 1 : 12;

  const yearTotal = totalForYear(receipts, selectedYear);
  const prevYearComparable = totalForYearThroughMonth(receipts, selectedYear - 1, monthsElapsed);
  const growthPct =
    prevYearComparable > 0 ? ((yearTotal - prevYearComparable) / prevYearComparable) * 100 : null;
  const compareLabel = isOngoingYear ? `전년 동기(~${monthsElapsed}월) 대비` : "전년 대비";

  return (
    <div>
      <div className="mb-stack-md w-32">
        <Select
          id="dividend-chart-year"
          value={String(selectedYear)}
          onChange={(v) => setYear(Number(v))}
          options={years.map((y) => ({ value: String(y), label: `${y}년` }))}
        />
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <filter id="dividendBarGlow" x="-75%" y="-75%" width="250%" height="250%">
                <feGaussianBlur stdDeviation="8" />
              </filter>
            </defs>
            <CartesianGrid stroke="var(--color-surface-container)" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={(m) => `${m}월`}
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
            <Tooltip content={<MonthTooltip />} />
            <Bar dataKey="amount" shape={<GlowBar />}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLOR_SCHEME[i % COLOR_SCHEME.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-stack-lg">
        <p className="text-body-lg font-medium text-on-surface">
          {selectedYear}년 총 배당금
        </p>
        <div className="flex items-center gap-stack-md">
          <span className="text-headline-lg font-headline-lg text-on-surface">
            {formatUsd(yearTotal)}
          </span>
          {growthPct != null && (
            <span
              className={`flex items-center gap-0.5 rounded-full px-2.5 py-1 text-label-md font-label-md font-bold ${
                growthPct >= 0 ? "bg-secondary/15 text-secondary" : "bg-error/15 text-error"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {growthPct >= 0 ? "arrow_upward" : "arrow_downward"}
              </span>
              {Math.abs(growthPct).toFixed(1)}%
            </span>
          )}
        </div>
        <p className="mt-stack-sm text-label-md font-label-md text-on-surface-variant">
          {compareLabel} {growthPct != null ? formatUsd(prevYearComparable) : "데이터 없음"}
        </p>
      </div>
    </div>
  );
}
