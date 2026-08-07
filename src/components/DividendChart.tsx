import type { YearlyProjection } from "@/lib/dividendCalc";

function formatUsd(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

export default function DividendChart({ data }: { data: YearlyProjection[] }) {
  if (data.length === 0) return null;

  const width = 320;
  const height = 160;
  const padLeft = 48;
  const padRight = 12;
  const padTop = 10;
  const padBottom = 24;
  const maxValue = Math.max(...data.map((d) => d.growthReinvest));
  const minYear = data[0].year;
  const maxYear = data[data.length - 1].year;

  const x = (year: number) =>
    padLeft + ((year - minYear) / Math.max(maxYear - minYear, 1)) * (width - padLeft - padRight);
  const y = (value: number) =>
    height - padBottom - (value / maxValue) * (height - padTop - padBottom);

  const linePoints = (field: "growth" | "growthReinvest") =>
    data.map((d) => `${x(d.year)},${y(d[field])}`).join(" ");

  const last = data[data.length - 1];

  return (
    <div>
      <div className="flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-emerald-600" /> 배당성장 + 재투자
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 border-t border-dashed border-slate-400" />{" "}
          배당성장만
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 w-full">
        <line x1={padLeft} y1={y(0)} x2={width - padRight} y2={y(0)} stroke="#cbd5e1" />
        <text x={padLeft - 4} y={y(0) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">
          $0
        </text>
        <text x={padLeft - 4} y={padTop + 8} fontSize="9" fill="#94a3b8" textAnchor="end">
          {formatUsd(maxValue)}
        </text>
        <polyline
          points={linePoints("growth")}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <polyline
          points={linePoints("growthReinvest")}
          fill="none"
          stroke="#059669"
          strokeWidth={2}
        />
        {data.map((d) => (
          <circle key={d.year} cx={x(d.year)} cy={y(d.growthReinvest)} r={2.5} fill="#059669" />
        ))}
        {data.map((d) => (
          <text
            key={d.year}
            x={x(d.year)}
            y={height - 6}
            fontSize="10"
            fill="#64748b"
            textAnchor="middle"
          >
            {d.year}년차
          </text>
        ))}
      </svg>

      <p className="mt-2 text-xs text-slate-500">
        {maxYear}년차 예상 연간 배당금 — 배당성장만: {formatUsd(last.growth)} · 재투자까지 하면:{" "}
        {formatUsd(last.growthReinvest)} (물가상승 반영한 오늘 가치로는{" "}
        {formatUsd(last.growthReinvestReal)})
      </p>
    </div>
  );
}
