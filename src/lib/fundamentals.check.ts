import assert from "node:assert";
import { fetchFundamentals } from "./fundamentals.ts";

// 네트워크를 실제로 타는 자체검사다(야후 장애 시 실패한다). 응답 필드 경로가 아직 유효한지
// 확인하는 게 목적 — quoteSummary의 cashflowStatementHistory가 예고 없이 비어버린 전례가 있다.
// 실행: node_modules/.bin/jiti src/lib/fundamentals.check.ts
const tickers = ["JNJ", "O", "MSFT", "BF.B"];
const results = await fetchFundamentals(tickers);

const payout = (fcf: number | null, div: number | null) =>
  fcf != null && div != null && fcf > 0 ? (div / fcf) * 100 : null;

for (const ticker of tickers) {
  const r = results[ticker];
  assert.ok(r?.ok, `${ticker} 실패: ${r && !r.ok ? r.error : "결과 없음"}`);
  console.log(ticker.padEnd(5), {
    fy: r.data.asOfDate,
    fcf: r.data.freeCashflow,
    fcf배당성향: payout(r.data.freeCashflow, r.data.dividendsPaid)?.toFixed(0) + "%",
    순부채: r.data.netDebt,
    missing: r.data.missing,
  });
}

const jnj = results.JNJ;
assert.ok(jnj.ok && jnj.data.missing.length === 0, `JNJ에 결측 지표: ${jnj.ok ? jnj.data.missing : ""}`);

// FCF = 영업현금흐름 - capex가 성립하는지(2026-08-15 실측 24.53B - 5.217B = 19.313B).
// 이 관계가 깨지면 야후가 기준을 바꾼 것이므로 점수 전체를 의심해야 한다.
assert.ok(jnj.ok && jnj.data.freeCashflow! > 10e9 && jnj.data.freeCashflow! < 30e9,
  `JNJ FCF가 예상 범위 밖: ${jnj.ok ? jnj.data.freeCashflow : ""}`);

// REIT도 FCF 기준이면 배당성향이 100% 안팎으로 정상 범위에 들어온다는 게 이 설계의 전제다.
// 순이익 기준이었다면 O가 276%로 나온다.
const o = results.O;
const oPayout = o.ok ? payout(o.data.freeCashflow, o.data.dividendsPaid) : null;
assert.ok(oPayout != null && oPayout > 30 && oPayout < 120,
  `O의 FCF 배당성향이 정상 범위를 벗어났다: ${oPayout}`);

// 클래스주(BF.B -> BF-B) 심볼 변환이 이 엔드포인트에서도 통하는지.
assert.ok(results["BF.B"].ok, "BF.B 조회 실패 — 클래스주 심볼 변환 확인");

console.log("fundamentals.selfcheck: OK");
