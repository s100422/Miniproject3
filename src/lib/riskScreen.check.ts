import assert from "node:assert";
import { parseNews } from "./riskScreen.ts";

// 네트워크는 안 탄다. 위험한 건 호출이 아니라 파싱이다 — 모델 응답은 형식이 흔들리고,
// 출처 귀속이 틀리면 소송 근거에 배당 기사 링크가 붙는다.

const meta = {
  groundingChunks: [
    { web: { uri: "https://example.com/dividend" } },
    { web: { uri: "https://example.com/lawsuit" } },
  ],
  groundingSupports: [
    { segment: { text: "2026년 5월 배당을 30% 삭감했다." }, groundingChunkIndices: [0] },
    { segment: { text: "집단소송이 제기됐다." }, groundingChunkIndices: [1] },
  ],
};

// 건별로 자기 출처가 붙는다. 첫 chunk를 전건에 재사용하면 안 된다.
const two = parseNews(
  "DIVIDEND_CUT|-|2026년 5월 배당을 30% 삭감했다.\nLITIGATION|-|집단소송이 제기됐다.",
  meta
);
assert.strictEqual(two.length, 2);
assert.strictEqual(two[0].source_url, "https://example.com/dividend");
assert.strictEqual(two[1].source_url, "https://example.com/lawsuit");
assert.strictEqual(two[0].kind, "dividend_cut");
assert.strictEqual(two[0].impact, "negative");

// 인용을 못 찾은 건은 버린다(출처 URL 필수). chunk가 여럿이라 넘겨짚지 않는다.
assert.strictEqual(parseNews("EARNINGS|+|근거 없는 주장이다.", meta).length, 0);

// chunk가 하나뿐이면 귀속이 모호하지 않으므로 그걸 쓴다.
const single = parseNews("EARNINGS|+|1분기 EPS가 예상을 웃돌았다.", {
  groundingChunks: [{ web: { uri: "https://example.com/only" } }],
});
assert.strictEqual(single[0]?.source_url, "https://example.com/only");
assert.strictEqual(single[0]?.impact, "positive");

// NONE과 머리말·맺음말은 사건이 아니다. 형식에 안 맞는 줄은 전부 버린다.
assert.strictEqual(parseNews("NONE", meta).length, 0);
assert.strictEqual(
  parseNews("검색 결과입니다:\n- 특별한 사건은 없었습니다.\n감사합니다.", meta).length,
  0
);

// 모르는 종류는 통과시키지 않는다(모델이 지어낸 라벨).
assert.strictEqual(parseNews("STOCK_SPLIT|-|액면분할했다.", meta).length, 0);

// 3건 상한. 모델이 더 많이 뱉어도 잘라낸다.
const many = parseNews(
  Array.from({ length: 5 }, () => "EARNINGS|-|1분기 EPS가 예상을 밑돌았다.").join("\n"),
  { groundingChunks: [{ web: { uri: "https://example.com/only" } }] }
);
assert.strictEqual(many.length, 3);

console.log("riskScreen.selfcheck: OK");
