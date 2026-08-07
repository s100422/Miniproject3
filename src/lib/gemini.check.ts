import assert from "node:assert";
import { validateCandidate, type DividendStock, type Candidate } from "./gemini.ts";

const stocks: DividendStock[] = [
  { ticker: "MDT", name: "Medtronic", dividend_yield: 3.35, consecutive_years: 50, sector: "Health Care", payout_months: [1, 4, 7, 10] },
  { ticker: "FRT", name: "Federal Realty", dividend_yield: 3.81, consecutive_years: 59, sector: "Real Estate", payout_months: [1, 4, 7, 10] },
  { ticker: "PG", name: "Procter & Gamble", dividend_yield: 2.97, consecutive_years: 70, sector: "Consumer Staples", payout_months: [2, 5, 8, 11] },
  { ticker: "CAT", name: "Caterpillar", dividend_yield: 0.75, consecutive_years: 33, sector: "Industrials", payout_months: [2, 5, 8, 11] },
  { ticker: "JNJ", name: "Johnson & Johnson", dividend_yield: 2.08, consecutive_years: 64, sector: "Health Care", payout_months: [3, 6, 9, 12] },
  { ticker: "TGT", name: "Target", dividend_yield: 3.14, consecutive_years: 55, sector: "Consumer Discretionary", payout_months: [3, 6, 9, 12] },
];

const goodCandidate: Candidate = {
  concept: "균형있게, 우량 대형주 중심",
  allocations: [
    { ticker: "FRT", weight_pct: 20 },
    { ticker: "PG", weight_pct: 20 },
    { ticker: "TGT", weight_pct: 20 },
    { ticker: "JNJ", weight_pct: 15 },
    { ticker: "CAT", weight_pct: 15 },
    { ticker: "MDT", weight_pct: 10 },
  ],
  advice_text: "분할매수로 시작하세요.",
};

// 정상 케이스 (지급월이 1~12월 전부 커버됨)
assert.strictEqual(validateCandidate(goodCandidate, stocks).valid, true);

// 환각 티커
assert.strictEqual(
  validateCandidate(
    { ...goodCandidate, allocations: [...goodCandidate.allocations, { ticker: "FAKE", weight_pct: 0 }] },
    stocks
  ).valid,
  false
);

// 비중 합계가 100이 아님
assert.strictEqual(
  validateCandidate({ ...goodCandidate, allocations: [{ ticker: "FRT", weight_pct: 50 }] }, stocks).valid,
  false
);

// 배당 지급월 커버 누락 (PG, JNJ만 있어서 1,4,7,10월이 빔)
assert.strictEqual(
  validateCandidate(
    { ...goodCandidate, allocations: [{ ticker: "PG", weight_pct: 50 }, { ticker: "JNJ", weight_pct: 50 }] },
    stocks
  ).valid,
  false
);

console.log("gemini validateCandidate self-check passed");
