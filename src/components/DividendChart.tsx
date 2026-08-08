"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { goalReachYear, type YearlyProjection } from "@/lib/dividendCalc";

export function formatUsd(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

// 사용자가 지정한 참고 프롬프트(recharts 데모)의 teal-500 / pink-500
const REINVEST_COLOR = "#14b8a6";
const GROWTH_COLOR = "#ec4899";

function GoalAchievedCallout({
  viewBox,
  value,
}: {
  viewBox?: { x: number; y: number };
  value?: string;
}) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  // 목표 달성 지점보다 왼쪽 구간은 두 선 모두 항상 목표선 아래에 있으므로, 라벨을 왼쪽 위에
  // 두면 그래프 선과 절대 겹치지 않는다. 왼쪽 여백이 부족할 때만 오른쪽으로 뒤집는다.
  const flipRight = x < 90;
  const dir = flipRight ? 1 : -1;
  const labelX = x + dir * 80;
  const labelY = y - 30;

  return (
    <g>
      <path
        d={`M ${labelX} ${labelY + 6} Q ${x + dir * 20} ${y - 16} ${x + dir * 6} ${y - 4}`}
        stroke="var(--color-error)"
        strokeWidth={1.5}
        fill="none"
        markerEnd="url(#goalArrowHead)"
      />
      <text
        x={labelX}
        y={labelY}
        textAnchor={flipRight ? "start" : "end"}
        fill="var(--color-error)"
        fontSize={11}
        fontWeight={700}
      >
        {value}
      </text>
    </g>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  const growth = payload.find((p) => p.dataKey === "growth")?.value;
  const reinvest = payload.find((p) => p.dataKey === "growthReinvest")?.value;

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-label-md font-label-md shadow-md">
      <p className="font-bold text-on-surface">{label}년차</p>
      {reinvest != null && (
        <p className="mt-stack-sm" style={{ color: REINVEST_COLOR }}>
          배당성장 + 재투자 <span className="font-bold">{formatUsd(reinvest)}</span>
        </p>
      )}
      {growth != null && (
        <p style={{ color: GROWTH_COLOR }}>
          배당성장만 <span className="font-medium">{formatUsd(growth)}</span>
        </p>
      )}
    </div>
  );
}

export default function DividendChart({
  data,
  goalAnnual,
}: {
  data: YearlyProjection[];
  goalAnnual?: number;
}) {
  if (data.length === 0) return null;

  const reachYear = goalAnnual ? goalReachYear(data, goalAnnual) : null;
  const last = data[data.length - 1];

  return (
    <div>
      <div className="flex flex-wrap gap-gutter text-label-md font-label-md text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: REINVEST_COLOR }} /> 배당성장
          + 재투자
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 border-t border-dashed"
            style={{ borderColor: GROWTH_COLOR }}
          />{" "}
          배당성장만
        </span>
        {goalAnnual != null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 border-t border-dashed border-error" /> 목표
          </span>
        )}
      </div>

      <div className="mt-stack-md h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 36, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dividendGrowthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={REINVEST_COLOR} stopOpacity={0.35} />
                <stop offset="100%" stopColor={REINVEST_COLOR} stopOpacity={0} />
              </linearGradient>
              <marker
                id="goalArrowHead"
                markerWidth={6}
                markerHeight={6}
                refX={3}
                refY={3}
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-error)" />
              </marker>
            </defs>
            <CartesianGrid stroke="var(--color-surface-container)" vertical={false} />
            <XAxis
              dataKey="year"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={data.map((d) => d.year)}
              tickFormatter={(y) => `${y}년차`}
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
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-outline-variant)" }} />
            {goalAnnual != null && (
              <ReferenceLine y={goalAnnual} stroke="var(--color-error)" strokeDasharray="5 4" />
            )}
            <Area type="monotone" dataKey="growthReinvest" stroke="none" fill="url(#dividendGrowthFill)" />
            <Line
              type="monotone"
              dataKey="growth"
              stroke={GROWTH_COLOR}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="growthReinvest"
              stroke={REINVEST_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: REINVEST_COLOR }}
              activeDot={{ r: 5 }}
            />
            {goalAnnual != null && reachYear != null && (
              <ReferenceDot
                x={reachYear}
                y={goalAnnual}
                r={5}
                fill="var(--color-error)"
                stroke="var(--color-surface-container-lowest)"
                strokeWidth={2}
                label={<GoalAchievedCallout value={`목표 ${formatUsd(goalAnnual)} 달성!`} />}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-stack-sm text-label-md font-label-md text-on-surface-variant">
        {last.year}년차 예상 연간 배당금 — 배당성장만: {formatUsd(last.growth)} · 재투자까지 하면:{" "}
        {formatUsd(last.growthReinvest)}
        {reachYear && ` · 재투자 시 약 ${Math.round(reachYear)}년차에 목표 도달`} (물가상승 반영한 오늘
        가치로는 {formatUsd(last.growthReinvestReal)})
      </p>
    </div>
  );
}
