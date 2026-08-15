import assert from "node:assert";
import { grade, scoreTicker } from "./dividendScore.ts";
import type { Fundamentals } from "./fundamentals.ts";
import type { DividendRates } from "./dividendRates.ts";

// 네트워크를 타지 않는 순수 계산 검사다. 실행: node_modules/.bin/jiti src/lib/dividendScore.check.ts

const healthyFundamentals: Fundamentals = {
  asOfDate: "2025-12-31",
  freeCashflow: 19_313_000_000,
  operatingCashflow: 24_530_000_000,
  capex: 5_217_000_000,
  dividendsPaid: 12_381_000_000, // OCF 대비 50%
  netIncome: 26_804_000_000,
  revenue: 94_193_000_000,
  revenuePrev: 88_000_000_000, // +7.0%
  operatingIncome: 23_500_000_000, // 마진 25%
  totalDebt: 40_000_000_000,
  cash: 25_000_000_000,
  netDebt: 15_000_000_000,
  ebitda: 30_000_000_000, // 순부채/EBITDA = 0.5
  interestExpense: 1_500_000_000, // 이자보상 20배
  dilutedEps: 10,
  missing: [],
};

const healthyRates: DividendRates = {
  dividend_yield: 3.0,
  dividend_growth_5y: 6.0,
  dividend_growth_1y: 6.5,
  yield_avg_5y: 2.9,
  yield_sd_5y: 0.4,
  price_change_12m: 8.0,
  price: 150, // PER 15
};

const healthy = scoreTicker({
  ticker: "TEST",
  sector: "Health Care",
  consecutive_years: 62,
  rates: healthyRates,
  fundamentals: healthyFundamentals,
});

assert.strictEqual(healthy.status, "ok");
assert.deepStrictEqual(healthy.flags, []);
assert.ok(healthy.total != null && healthy.total >= 70, `건강한 종목이 ${healthy.total}점`);
assert.strictEqual(healthy.metrics.payout_ocf, 50.5);
assert.strictEqual(healthy.metrics.net_debt_to_ebitda, 0.5);

// ── 배당함정: 세 조건을 전부 만족해야만 잡힌다 ───────────────────────────────
const trapRates: DividendRates = {
  dividend_yield: 6.5, // 평균 3.0 + 1.75σ
  dividend_growth_5y: 2.0,
  dividend_growth_1y: 0.5,
  yield_avg_5y: 3.0,
  yield_sd_5y: 2.0,
  price_change_12m: -35,
  price: 40,
};
const trapFundamentals: Fundamentals = {
  ...healthyFundamentals,
  dividendsPaid: 20_000_000_000, // OCF 대비 81.5% -> 기본 경고선 70% 초과
};
const trap = scoreTicker({
  ticker: "TRAP",
  sector: "Consumer Staples",
  consecutive_years: 30,
  rates: trapRates,
  fundamentals: trapFundamentals,
});
assert.ok(trap.flags.includes("dividend_trap"), "배당함정이 안 잡혔다");
assert.ok(trap.metrics.yield_z === 1.8, `yield_z가 ${trap.metrics.yield_z}`);

// 주가가 안 빠졌으면 함정이 아니다 — 고배당 자체는 위험이 아니라는 원칙.
const highYieldOnly = scoreTicker({
  ticker: "HIGH",
  sector: "Consumer Staples",
  consecutive_years: 30,
  rates: { ...trapRates, price_change_12m: 5 },
  fundamentals: trapFundamentals,
});
assert.ok(!highYieldOnly.flags.includes("dividend_trap"), "주가 하락 없이 함정 판정됐다");
assert.ok(highYieldOnly.flags.includes("payout_warning"), "배당성향 경고는 떠야 한다");
// 함정 감점만큼 안전성 점수가 벌어져야 한다.
assert.ok(
  highYieldOnly.safety! - trap.safety! === 25,
  `함정 감점이 25점이 아니다: ${highYieldOnly.safety} vs ${trap.safety}`
);

// ── 섹터별 배당성향 기준선 ────────────────────────────────────────────────────
// 같은 80% 배당성향이라도 리츠에선 정상, 유틸리티에선 위험선이다.
const payout80 = { ...healthyFundamentals, dividendsPaid: 19_624_000_000 }; // OCF 대비 80%
const reit = scoreTicker({ ticker: "R", sector: "Real Estate", consecutive_years: 30, rates: healthyRates, fundamentals: payout80 });
const util = scoreTicker({ ticker: "U", sector: "Utilities", consecutive_years: 30, rates: healthyRates, fundamentals: payout80 });
assert.ok(!reit.flags.includes("payout_warning"), "리츠 80%가 경고로 잡혔다");
assert.ok(util.flags.includes("payout_warning"), "유틸리티 80%가 경고로 안 잡혔다");
assert.ok(reit.safety! > util.safety!, "같은 배당성향인데 리츠가 유틸리티보다 안전하지 않다");

// ── 성장 감속 ────────────────────────────────────────────────────────────────
const slowing = scoreTicker({
  ticker: "SLOW",
  sector: "Industrials",
  consecutive_years: 40,
  rates: { ...healthyRates, dividend_growth_5y: 9, dividend_growth_1y: 1 }, // -8%p
  fundamentals: healthyFundamentals,
});
assert.ok(slowing.flags.includes("growth_deceleration"), "성장 감속이 안 잡혔다");
assert.ok(slowing.growth! < healthy.growth!, "감속했는데 성장 점수가 안 낮아졌다");

// ── 결측 처리 ────────────────────────────────────────────────────────────────
// 일부 지표가 비면 남은 것끼리 재정규화하되 status는 partial로 내려간다.
const partial = scoreTicker({
  ticker: "P",
  sector: "Industrials",
  consecutive_years: 40,
  rates: healthyRates,
  fundamentals: { ...healthyFundamentals, ebitda: null, interestExpense: null, missing: ["ebitda", "interestExpense"] },
});
assert.strictEqual(partial.status, "partial");
assert.ok(partial.total != null, "일부 결측인데 점수가 통째로 날아갔다");
assert.strictEqual(partial.metrics.net_debt_to_ebitda, null);

// 재무를 통째로 못 받으면 미분석이다. 0점으로 두면 "위험한 종목"으로 오독된다.
const failed = scoreTicker({ ticker: "F", sector: "Industrials", consecutive_years: 40, rates: null, fundamentals: null });
assert.strictEqual(failed.status, "failed");
assert.strictEqual(failed.total, null);
assert.strictEqual(grade(failed.total), "미분석");

// 배당이력이 있어도 재무가 없으면 미분석이다 — 연속배당년수만으로 안전성을 판정하면
// "40년 인상했으니 안전"이라는 근거 없는 점수가 나온다.
const noFundamentals = scoreTicker({
  ticker: "NF",
  sector: "Industrials",
  consecutive_years: 40,
  rates: healthyRates,
  fundamentals: null,
});
assert.strictEqual(noFundamentals.status, "failed");
assert.strictEqual(noFundamentals.safety, null);

// 반대로 배당이력만 없으면 남은 축으로 점수가 나온다(성장성 축만 빠짐).
const noRates = scoreTicker({
  ticker: "NR",
  sector: "Industrials",
  consecutive_years: 40,
  rates: null,
  fundamentals: healthyFundamentals,
});
assert.strictEqual(noRates.status, "partial");
assert.ok(noRates.total != null && noRates.safety != null, "재무가 있는데 점수가 안 나왔다");
assert.strictEqual(noRates.growth, null);

// ── 등급 컷 ──────────────────────────────────────────────────────────────────
assert.strictEqual(grade(75), "안전");
assert.strictEqual(grade(74.9), "양호");
assert.strictEqual(grade(59.9), "주의");
assert.strictEqual(grade(44.9), "경계");

console.log("dividendScore.selfcheck: OK", {
  건강: healthy.total,
  함정: trap.total,
  고배당만: highYieldOnly.total,
  감속: slowing.total,
});
