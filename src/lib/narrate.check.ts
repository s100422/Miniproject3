import assert from "node:assert";
import { buildFactBlock, verifyNarrative } from "./narrate.ts";
import type { TickerAnalysis } from "./tickerAnalysis.ts";

// 네트워크는 안 탄다. Gemini 호출은 실패하면 그 종목만 빠지지만, **검증 게이트가 뚫리면
// 틀린 수치가 화면에 박힌다.** 그래서 게이트만 본다.

const row = {
  ticker: "KO",
  as_of: "2026-08-15",
  total_score: 52.5,
  safety_score: 48.2,
  growth_score: 60.1,
  strength_score: 44.9,
  value_score: 61.3,
  dividend_yield: 2.37,
  dividend_growth_5y: 4.8,
  price: 87.71,
  status: "ok",
  metrics: {
    payout_ocf: 62.3,
    payout_band: { good: 35, warn: 70, bad: 90 },
    net_debt_to_ebitda: 3.1,
    interest_coverage: 8.4,
    operating_margin: null,
    fundamentals_as_of: "2024-12-31",
    flags: ["financial_stress", "payout_warning"],
  },
  news: null,
} as unknown as TickerAnalysis;

const facts = buildFactBlock(row);

// 값이 있는 지표만 들어간다. null인 영업이익률은 아예 언급되지 않아야 한다 —
// 프롬프트에 없으면 모델이 인용할 수 없고, 인용하면 게이트에 걸린다.
assert.ok(facts.includes("배당성향(영업현금흐름 기준): 62.3%"));
assert.ok(facts.includes("이 종목 섹터의 배당성향 경고선: 70%"));
assert.ok(facts.includes("재무 부담"));
assert.ok(!facts.includes("영업이익률"));

// 주어진 수치를 그대로 인용한 문장은 통과한다.
assert.strictEqual(
  verifyNarrative("배당성향이 62.3%로 섹터 경고선 70%를 넘지 않았지만, 순부채/EBITDA가 3.1배다.", facts).ok,
  true
);

// 반올림 인용은 통과시킨다(62.3 -> 62).
assert.strictEqual(verifyNarrative("배당성향 62%에 이자보상배율 8.4배다.", facts).ok, true);

// **없던 숫자를 하나라도 만들면 문장을 통째로 버린다.** 나머지가 다 맞아도 마찬가지다.
const invented = verifyNarrative(
  "배당성향이 62.3%이고 순부채/EBITDA는 3.1배이며, 최근 5년간 주가가 41.7% 올랐다.",
  facts
);
assert.strictEqual(invented.ok, false);
assert.deepStrictEqual(invented.unknown, [41.7]);

// null이라 프롬프트에 없던 지표를 지어내는 경우 — 이게 실제로 막아야 할 환각이다.
assert.strictEqual(verifyNarrative("영업이익률이 29.8%로 높다.", facts).ok, false);

// 숫자를 거의 안 쓴 문장은 "숫자를 근거로 쓴 글"이 아니다.
assert.strictEqual(verifyNarrative("배당은 대체로 안정적인 편으로 보인다.", facts).ok, false);
assert.strictEqual(verifyNarrative("배당성향이 62.3%다.", facts).ok, false);

// 라벨에 박힌 숫자와 기준일도 인용할 수 있어야 한다. 프롬프트에 있는 문자열이기 때문이다.
assert.strictEqual(
  verifyNarrative("5년 배당성장률이 4.8%이고 재무 기준일은 2024-12-31이다.", facts).ok,
  true
);

// 점수를 못 낸 종목은 인용할 숫자 자체가 없다.
const failed = buildFactBlock({
  ticker: "XYZ",
  total_score: null,
  metrics: { missing: ["fundamentals"] },
} as unknown as TickerAnalysis);
assert.strictEqual(verifyNarrative("종합 점수는 71.2점이다.", failed).ok, false);

console.log("narrate.selfcheck: OK");
