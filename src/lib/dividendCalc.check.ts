import assert from "node:assert";
import { presentValue, projectDividendGrowth } from "./dividendCalc.ts";

// 성장률 0%일 때 growth는 base와 같아야 하고, 재투자만 추가 이득을 만들어야 한다
const rows = projectDividendGrowth(
  [{ ticker: "A", weight_pct: 100 }],
  { A: { dividend_yield: 10, dividend_growth_5y: 0 } },
  100,
  24,
  0
);

assert.deepStrictEqual(
  rows.map((r) => r.base),
  [120, 240]
);
assert.deepStrictEqual(
  rows.map((r) => r.growth),
  [120, 240]
);
assert.deepStrictEqual(
  rows.map((r) => r.growthReinvest),
  [120, 252]
);
assert.deepStrictEqual(
  rows.map((r) => r.growthReinvestReal),
  [120, 252]
);

// 인플레이션 반영 시 미래가치가 할인되어야 한다
const pv = presentValue(1000, 10, 0.03);
assert.ok(Math.abs(pv - 744.09) < 0.5);

console.log("dividendCalc self-check passed");
