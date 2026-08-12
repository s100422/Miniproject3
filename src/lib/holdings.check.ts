import assert from "node:assert";
import { aggregateHoldings } from "./holdings.ts";

// 1/10에 5주를 $10에, 3/1에 3주를 $14에 매수 -> 평단가 (5*10+3*14)/8 = 11.5
// 4/1에 4주 매도 -> 남은 4주, 평단가는 11.5 그대로, 매입원가만 절반으로 줄어듦
const result = aggregateHoldings([
  { ticker: "KO", name: "Coca-Cola", type: "buy", quantity: 5, price: 10, trade_date: "2024-01-10" },
  { ticker: "KO", name: "Coca-Cola", type: "buy", quantity: 3, price: 14, trade_date: "2024-03-01" },
  { ticker: "KO", name: "Coca-Cola", type: "sell", quantity: 4, price: 20, trade_date: "2024-04-01" },
]);

assert.strictEqual(result.length, 1);
assert.strictEqual(result[0].quantity, 4);
assert.strictEqual(result[0].avgPrice, 11.5);

// 전량 매도한 종목은 결과에서 빠진다
const soldOut = aggregateHoldings([
  { ticker: "PG", name: "P&G", type: "buy", quantity: 2, price: 100, trade_date: "2024-01-01" },
  { ticker: "PG", name: "P&G", type: "sell", quantity: 2, price: 120, trade_date: "2024-02-01" },
]);
assert.strictEqual(soldOut.length, 0);

console.log("holdings.selfcheck: OK");
