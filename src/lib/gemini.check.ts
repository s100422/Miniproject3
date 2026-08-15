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

// reason에는 그 종목의 실제 수익률이나 연속 배당 연수가 인용돼 있어야 통과한다.
// **픽스처에서 이걸 빼먹으면 검사가 통째로 예외로 죽는다** — 실제로 그렇게 죽어 있었다.
const goodCandidate: Candidate = {
  concept: "균형있게, 우량 대형주 중심",
  allocations: [
    { ticker: "FRT", weight_pct: 20, reason: "59년 연속 배당을 늘려온 리츠예요." },
    { ticker: "PG", weight_pct: 20, reason: "수익률 2.97%에 70년 연속 인상이에요." },
    { ticker: "TGT", weight_pct: 20, reason: "수익률 3.14%로 소비재 중 높은 편이에요." },
    { ticker: "JNJ", weight_pct: 15, reason: "64년 연속 배당을 늘렸어요." },
    { ticker: "CAT", weight_pct: 15, reason: "수익률 0.75%지만 33년째 인상 중이에요." },
    { ticker: "MDT", weight_pct: 10, reason: "50년 연속 인상한 배당왕이에요." },
  ],
  advice_text: "분할매수로 시작하세요.",
};

// 정상 케이스 (지급월이 1~12월 전부 커버됨)
assert.strictEqual(validateCandidate(goodCandidate, stocks).valid, true);

// 환각 티커
assert.strictEqual(
  validateCandidate(
    {
      ...goodCandidate,
      allocations: [...goodCandidate.allocations, { ticker: "FAKE", weight_pct: 0, reason: "50년 연속" }],
    },
    stocks
  ).valid,
  false
);

// 근거 없는 설명 — 숫자가 아예 없거나 실제 값과 다르면 버린다
assert.strictEqual(
  validateCandidate(
    { ...goodCandidate, allocations: [{ ticker: "FRT", weight_pct: 100, reason: "좋은 종목이에요." }] },
    stocks
  ).valid,
  false
);

// reason이 아예 없는 응답. **던지지 않고 false로 걸러야 한다** — 던지면 라우트가 검증 실패(502)가
// 아니라 처리 안 된 500을 낸다.
assert.strictEqual(
  validateCandidate(
    // 스키마상 필수라 타입엔 있지만, 모델이 실제로 빼먹는 경우를 흉내낸다
    { ...goodCandidate, allocations: [{ ticker: "FRT", weight_pct: 100 } as never] },
    stocks
  ).valid,
  false
);

// 비중 합계가 100이 아님
assert.strictEqual(
  validateCandidate(
    { ...goodCandidate, allocations: [{ ticker: "FRT", weight_pct: 50, reason: "59년 연속 인상이에요." }] },
    stocks
  ).valid,
  false
);

// 배당 지급월 커버 누락 (PG, JNJ만 있어서 1,4,7,10월이 빔)
assert.strictEqual(
  validateCandidate(
    {
      ...goodCandidate,
      allocations: [
        { ticker: "PG", weight_pct: 50, reason: "70년 연속 인상이에요." },
        { ticker: "JNJ", weight_pct: 50, reason: "64년 연속 인상이에요." },
      ],
    },
    stocks
  ).valid,
  false
);

console.log("gemini validateCandidate self-check passed");
