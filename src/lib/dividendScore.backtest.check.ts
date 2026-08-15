import assert from "node:assert";
import { deriveRates, fetchChart, parseChart, priceAt, type DividendEvent } from "./dividendRates.ts";
import { fetchFundamentals } from "./fundamentals.ts";
import { scoreTicker } from "./dividendScore.ts";

/**
 * **점수 모델 역검증.** 이미 배당을 삭감한 종목의 삭감 직전 데이터를 넣어 경고가 떴는지 본다
 * (docs/ROADMAP.md 87~89줄). 카탈로그에는 배당귀족만 있어서 함정 탐지기가 양성 사례를
 * 한 번도 못 잡아보기 때문에, 이 검사가 없으면 탐지기가 작동하는지 알 수 없다.
 *
 * 네트워크를 탄다. 실행: node_modules/.bin/jiti src/lib/dividendScore.backtest.check.ts
 */

const DAY = 86400;

// 삭감 당시 카탈로그에 있었을 값. 연속배당년수는 배당안전성 축의 25%만 차지하고,
// 함정 판정 자체에는 쓰이지 않는다.
const CASES = [
  { ticker: "LEG", sector: "Consumer Discretionary", consecutive_years: 52 },
  { ticker: "TDS", sector: "Communication Services", consecutive_years: 49 },
];

/** 직전 지급액의 70% 밑으로 떨어진 첫 배당 = 삭감. 분기→반기 전환 같은 주기 변경은 무시된다. */
function findCut(divs: DividendEvent[]): DividendEvent | null {
  const sorted = [...divs].sort((a, b) => a.date - b.date);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].amount < sorted[i - 1].amount * 0.7) return sorted[i];
  }
  return null;
}

let anyDetected = false;

for (const c of CASES) {
  const chart = await fetchChart(c.ticker);
  assert.ok(chart, `${c.ticker} 차트를 못 받았다`);
  const { prices, divs } = parseChart(chart);

  const cut = findCut(divs);
  assert.ok(cut, `${c.ticker}의 배당 삭감 지점을 못 찾았다`);
  const cutDate = new Date(cut.date * 1000).toISOString().slice(0, 10);
  console.log(`\n=== ${c.ticker} — 배당 삭감 ${cutDate} ($${cut.amount}) ===`);
  console.log("시점        수익률  5년평균   z    12개월주가  배당성향(경고선)  함정  총점  안전");

  // 삭감 시점 자체가 아니라 그 전 여러 시점에서 본다. 삭감은 보통 한두 달 전에 발표되므로
  // 3개월 전까지만 "미리 경고했다"고 인정할 수 있다.
  for (const monthsBefore of [12, 6, 3]) {
    const at = cut.date - monthsBefore * 30.44 * DAY;
    const atIso = new Date(at * 1000).toISOString().slice(0, 10);
    const price = priceAt(prices, at);
    if (price == null) {
      console.log(`${atIso}  주가 데이터 없음`);
      continue;
    }

    const rates = deriveRates(prices, divs, at, price);
    // 그 시점까지 공시된 회계연도만 쓴다. 미래 재무제표를 보면 검증이 아니라 커닝이다.
    const f = (await fetchFundamentals([c.ticker], atIso))[c.ticker];
    const result = scoreTicker({
      ticker: c.ticker,
      sector: c.sector,
      consecutive_years: c.consecutive_years,
      rates,
      fundamentals: f?.ok ? f.data : null,
    });

    const m = result.metrics;
    const trap = result.flags.includes("dividend_trap");
    if (trap) anyDetected = true;
    console.log(
      atIso,
      String(rates.dividend_yield ?? "—").padStart(6),
      String(rates.yield_avg_5y ?? "—").padStart(7),
      String(m.yield_z ?? "—").padStart(6),
      String(rates.price_change_12m ?? "—").padStart(9) + "%",
      `${String(m.payout_ocf ?? "—").padStart(8)}(${m.payout_band.warn})`,
      (trap ? "  🚩" : "   ·").padStart(6),
      String(result.total ?? "미분석").padStart(6),
      String(result.safety ?? "—").padStart(5),
      result.flags.filter((x) => x !== "dividend_trap").join(",")
    );
  }
}

// 건강한 종목(JNJ)은 같은 경로로 돌려도 함정이 아니어야 한다 — 위양성 확인.
const jnjChart = await fetchChart("JNJ");
const { prices: jp, divs: jd } = parseChart(jnjChart);
const jNow = Date.now() / 1000;
const jf = (await fetchFundamentals(["JNJ"]))["JNJ"];
const jnj = scoreTicker({
  ticker: "JNJ",
  sector: "Health Care",
  consecutive_years: 63,
  rates: deriveRates(jp, jd, jNow, priceAt(jp, jNow)!),
  fundamentals: jf?.ok ? jf.data : null,
});
console.log(`\nJNJ(대조군) 총점 ${jnj.total} · 플래그 ${jnj.flags.join(",") || "없음"}`);
assert.ok(!jnj.flags.includes("dividend_trap"), "건강한 종목(JNJ)에 함정이 잡혔다 — 위양성");

assert.ok(anyDetected, "삭감 종목 어디서도 배당함정이 안 잡혔다 — 탐지기가 작동하지 않는다");
console.log("\ndividendScore.backtest: OK");
