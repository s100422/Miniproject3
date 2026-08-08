"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * 앞 5개(blue·yellow·green·purple·gray)는 지정된 hsl 원본값을 그대로 hex 변환한 값이고,
 * orange·teal·red·chartreuse 4개는 실제 플랜에서 9종목까지 나온 사례가 있어(links to
 * dividend_stocks 결제월 분포상 이론적으로 더 늘 수도 있음) 같은 톤으로 추가했다.
 * dataviz validate_palette.js로 검증(라이트/화이트 카드 기준, 도넛 링이라 마지막-처음
 * wrap-around 인접쌍도 별도 확인):
 * - 순서 배치로 CVD 인접쌍·정상시야 구분은 전부 PASS(wrap-around 포함)
 * - yellow(#facc15)는 명도밴드 초과 + 대비 1.53:1(기준 3:1) — 흰 카드에서 거의 안 보임
 * - gray(#a3a3a3)는 채도 0 — 색상 정체성이 없어 색만으로는 구분 불가
 * 두 문제는 알고도 원본값 유지를 택함 — 범례가 직접 라벨(티커+비중)을 보여주므로
 * "색만으로 구분 안 되면 라벨로 구제한다"는 조건으로 허용됨. 순서를 바꾸면
 * 인접쌍(과 wrap-around)이 달라지니 재검증 없이 재배열하지 말 것.
 *
 * ponytail: 9개까지만 검증했다. 10개 이상(이론상 pickPortfolio가 월별로 최대
 * 12개까지 채울 수 있음)이 되면 다시 index % length로 순환되어 색이 겹친다.
 * 실제로 그런 사례가 나오면 색을 더 추가하거나, 겹치는 구간에 무늬/테두리 같은
 * 2차 구분 수단을 추가할 것.
 */
export const ALLOCATION_COLORS = [
  "#0557c7", // blue
  "#e9680c", // orange
  "#0d9c9c", // teal
  "#facc15", // yellow — 흰 배경에서 대비 약함, 범례로 보완
  "#16a34a", // green
  "#7c3aed", // purple
  "#e21224", // red
  "#a3a3a3", // gray — 무채색, 범례로 보완
  "#5a8c1e", // chartreuse
];

export const colorFor = (index: number) => ALLOCATION_COLORS[index % ALLOCATION_COLORS.length];

const SIZE = 240;
const CENTER = SIZE / 2;
const STROKE_WIDTH = 28;
const RADIUS = CENTER - STROKE_WIDTH / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function AllocationPie({
  allocations,
}: {
  allocations: { ticker: string; weight_pct: number }[];
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (allocations.length === 0) return null;

  let cumulative = 0;
  const segments = allocations.map((a, i) => {
    const dash = (a.weight_pct / 100) * CIRCUMFERENCE;
    const offset = (cumulative / 100) * CIRCUMFERENCE;
    cumulative += a.weight_pct;
    return { ...a, color: colorFor(i), dash, offset };
  });

  const active = segments.find((s) => s.ticker === hovered) ?? null;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: SIZE, height: SIZE }}
      onMouseLeave={() => setHovered(null)}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90 overflow-visible"
        role="img"
        aria-label={`종목별 비중: ${allocations.map((a) => `${a.ticker} ${a.weight_pct}%`).join(", ")}`}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--color-surface-container)"
          strokeWidth={STROKE_WIDTH}
        />
        {segments.map((s, i) => (
          <motion.circle
            key={s.ticker}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${s.dash} ${CIRCUMFERENCE}`}
            className="origin-center cursor-pointer"
            style={{
              filter: hovered === s.ticker ? `drop-shadow(0 0 6px ${s.color})` : "none",
              transform: hovered === s.ticker ? "scale(1.03)" : "scale(1)",
              transition: "filter 0.2s ease-out, transform 0.2s ease-out",
            }}
            initial={{ strokeDashoffset: CIRCUMFERENCE, opacity: 0 }}
            animate={{ strokeDashoffset: -s.offset, opacity: 1 }}
            transition={{ duration: 0.8, delay: i * 0.06, ease: "easeOut" }}
            onMouseEnter={() => setHovered(s.ticker)}
          />
        ))}
      </svg>

      <div className="pointer-events-none absolute flex flex-col items-center justify-center text-center">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active.ticker}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
            >
              <p className="text-headline-md font-headline-md text-primary">{active.ticker}</p>
              <p className="text-label-md font-label-md text-on-surface-variant">
                {active.weight_pct}%
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="total"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
            >
              <p className="text-display-lg font-display-lg text-primary">{allocations.length}</p>
              <p className="text-label-md font-label-md text-on-surface-variant">보유 종목</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
