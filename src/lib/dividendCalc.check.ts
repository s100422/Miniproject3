import assert from "node:assert";
import {
  presentValue,
  projectDividendGrowth,
  goalReachYear,
  realisticBestAnnualDividend,
  type PortfolioStock,
} from "./dividendCalc.ts";

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

// 목표 도달 시점: 마일스톤 사이 값은 보간해서 마일스톤 연도 사이로 나와야 한다
const milestones = [
  { year: 25, base: 0, growth: 0, growthReinvest: 16850, growthReinvestReal: 0 },
  { year: 30, base: 0, growth: 0, growthReinvest: 27911, growthReinvestReal: 0 },
];
const reach = goalReachYear(milestones, 24000)!;
assert.ok(reach > 25 && reach < 30, `보간 결과가 25~30년차 사이여야 함: ${reach}`);
// 기하보간이므로 25년차 값을 이 비율만큼 키우면 정확히 목표가 되어야 한다
const ratio = Math.pow(27911 / 16850, (reach - 25) / 5);
assert.ok(Math.abs(16850 * ratio - 24000) < 1);

// 첫 마일스톤에서 이미 달성했으면 그 연도를, 끝까지 못 미치면 null을 준다
assert.strictEqual(goalReachYear(milestones, 10000), 25);
assert.strictEqual(goalReachYear(milestones, 99999), null);

// 현실 기준 상한: A/B/C 세 그룹이 섞여 있어야 12개월이 커버된다
const A = [1, 4, 7, 10];
const B = [2, 5, 8, 11];
const C = [3, 6, 9, 12];
const pool: PortfolioStock[] = [
  // 고배당이지만 전부 A그룹이라, 이것만 뽑으면 B·C월이 빈다
  ...[9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5].map((y, i) => ({
    ticker: `A${i}`,
    dividend_yield: y,
    dividend_growth_5y: 1,
    payout_months: A,
  })),
  { ticker: "B1", dividend_yield: 2, dividend_growth_5y: 1, payout_months: B },
  { ticker: "C1", dividend_yield: 2, dividend_growth_5y: 1, payout_months: C },
];

const realistic = realisticBestAnnualDividend(pool, 300);

// 한 종목 몰빵(=최고 수익률 9%)보다는 낮아야 한다. 커버용 저수익 종목이 섞이기 때문
const solo = projectDividendGrowth(
  [{ ticker: "x", weight_pct: 100 }],
  { x: { dividend_yield: 9, dividend_growth_5y: 1 } },
  300,
  360
);
assert.ok(
  realistic < solo[solo.length - 1].growthReinvest,
  "현실 기준은 몰빵 상한보다 낮아야 한다"
);

// 균등 분산이라 평균 수익률 수준은 나와야 한다(커버 종목 때문에 지나치게 낮아지면 안 됨)
assert.ok(realistic > 0, "포트폴리오를 구성하지 못하면 안 된다");

// "필요 투자금 = 현재 투자금 × 목표/상한" 공식은 결과가 투자금에 정비례할 때만 성립한다
assert.ok(Math.abs(realisticBestAnnualDividend(pool, 600) - realistic * 2) < 0.02);

console.log("dividendCalc self-check passed");
