import assert from "node:assert";
import { diagnosePortfolio } from "./portfolioDiagnosis.ts";
import type { TickerAnalysis } from "./tickerAnalysis.ts";

const row = (
  ticker: string,
  total_score: number | null,
  flags: string[] = [],
  status: TickerAnalysis["status"] = "ok"
): TickerAnalysis =>
  ({ ticker, as_of: "2026-08-15", total_score, status, metrics: { flags } }) as TickerAnalysis;

const now = new Date("2026-08-15T00:00:00Z");
const Q = [3, 6, 9, 12];

// 배당수익률만 다르고 평가금액은 같은 4종목. 배당 비중과 평가금액 비중이 갈리도록 짰다.
const catalog = {
  SAFE: { dividend_yield: 1, payout_months: Q, sector: "Tech", name: "Safe Co" },
  WARN: { dividend_yield: 8, payout_months: Q, sector: "Utilities", name: "Warn Co" },
  RISK: { dividend_yield: 1, payout_months: Q, sector: "Utilities", name: "Risk Co" },
  DARK: { dividend_yield: 2, payout_months: [1, 7], sector: "Utilities", name: "Dark Co" },
  FRESH: { dividend_yield: 3, payout_months: [2, 8], sector: "Tech", name: "Fresh Co" },
};

const d = diagnosePortfolio({
  holdings: [
    { ticker: "SAFE", name: "Safe Co", marketValue: 1000 },
    { ticker: "WARN", name: "Warn Co", marketValue: 1000 },
    { ticker: "RISK", name: "Risk Co", marketValue: 1000 },
    { ticker: "DARK", name: "Dark Co", marketValue: 1000 },
  ],
  analysis: {
    SAFE: row("SAFE", 80),
    WARN: row("WARN", 55, ["financial_stress"]),
    RISK: row("RISK", 40),
    DARK: row("DARK", null, [], "failed"),
    FRESH: row("FRESH", 90),
  },
  catalog,
  receipts: [],
  now,
});

// 세후 연배당: 수익률 × 평가금액 × 0.85. 비중은 평가금액이 아니라 배당 기준이어야 한다 —
// 넷 다 평가금액은 같지만 WARN 하나가 배당의 절반 이상을 낸다.
assert.strictEqual(Math.round(d.annualDividend), Math.round(1000 * 0.12 * 0.85));
assert.strictEqual(d.byTier.warn.share, 66.7);
assert.strictEqual(d.byTier.risk.share, 8.3);
assert.strictEqual(d.byTier.ok.share, 8.3);

// 미분석은 조용히 빠지지 않고 자기 몫을 갖는다. 빼버리면 나머지 비중이 부풀어 오른다.
assert.deepStrictEqual(d.byTier.unanalyzed.tickers, ["DARK"]);
assert.strictEqual(d.byTier.unanalyzed.share, 16.7);
assert.strictEqual(
  d.byTier.risk.share + d.byTier.warn.share + d.byTier.ok.share + d.byTier.unanalyzed.share,
  100
);

// 가중평균은 점수 있는 종목만 쓰고, 그게 배당의 몇 %인지 같이 알려준다.
// (80×1 + 55×8 + 40×1) / 10 = 56.0, 커버리지는 DARK를 뺀 83.3%.
assert.strictEqual(d.weightedSafety, 56);
assert.strictEqual(d.safetyCoverage, 83.3);

// 섹터 집중도는 평가금액 기준. Utilities 75% + Tech 25% -> 75² + 25² = 6250.
assert.strictEqual(d.sectorHhi, 6250);
assert.strictEqual(d.topSector?.sector, "Utilities");

// 3·6·9·12월과 1·7월에만 배당이 들어온다.
assert.deepStrictEqual(d.emptyMonths, [2, 4, 5, 8, 10, 11]);

const byKind = Object.fromEntries(d.actions.map((a) => [a.kind, a]));
// 축소 검토는 위험 등급이 있으면 그쪽이 먼저다(배당 비중이 더 큰 WARN이 아니라 RISK).
assert.strictEqual(byKind.reduce.ticker, "RISK");
// 확대 검토는 안전한데 배당 기여가 평균 미만인 종목.
assert.strictEqual(byKind.expand.ticker, "SAFE");
// 신규 편입은 미보유 중에서 고르고, 공백 달(2·8월)을 메우는 쪽을 집는다.
assert.strictEqual(byKind.new.ticker, "FRESH");
assert.ok(byKind.new.reason.includes("2·8월"));

// 위험 등급이 없으면 축소 검토는 경고 등급으로 내려간다. 그때 **점수만 보고 고르면 안 된다** —
// 점수가 더 낮아도 배당의 한 줌만 대는 종목은 삭감돼도 계획이 안 깨진다.
// TINY(45점, 비중 6%)보다 BIG(55점, 비중 94%)이 잃을 게 크다: 55×6 < 45×94.
const noRisk = diagnosePortfolio({
  holdings: [
    { ticker: "WARN", name: "Big Co", marketValue: 10000 },
    { ticker: "DARK", name: "Tiny Co", marketValue: 400 },
  ],
  analysis: {
    WARN: row("WARN", 55, ["financial_stress"]),
    DARK: row("DARK", 45, ["financial_stress"]),
  },
  catalog: { ...catalog, DARK: { ...catalog.DARK, dividend_yield: 8 } },
  receipts: [],
  now,
});
assert.strictEqual(noRisk.byTier.warn.share, 100);
assert.strictEqual(noRisk.actions.find((a) => a.kind === "reduce")?.ticker, "WARN");

// 보유가 없으면 0으로 나누지 않고 조용히 빈 진단을 낸다.
const empty = diagnosePortfolio({ holdings: [], analysis: {}, catalog, receipts: [], now });
assert.strictEqual(empty.annualDividend, 0);
assert.strictEqual(empty.weightedSafety, null);
assert.strictEqual(empty.byTier.risk.share, 0);
assert.deepStrictEqual(empty.emptyMonths, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

console.log("portfolioDiagnosis.selfcheck: OK");
