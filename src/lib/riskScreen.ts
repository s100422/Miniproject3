export type RiskSignal = {
  ticker: string;
  signal: "dividend_cut" | "dividend_increase";
  reason: string;
  source_url: string;
};

const SEARCH_INSTRUCTION = `당신은 배당주 리스크 검색 도우미입니다. 주어진 티커에 대해 최근 6개월
이내에 발표된 아래 두 가지 이벤트 중 하나가 실제로 있었는지 웹 검색으로 확인하세요.

- dividend_cut: 배당 삭감 또는 중단 발표, 실적 가이던스 대폭 하향, 신용등급 강등, 파산/구조조정 관련 뉴스
- dividend_increase: 배당 인상 발표

일반적인 시황 논평, 애널리스트 의견, 단순 주가 변동은 이벤트로 치지 마세요. 애매하면 무조건 NONE으로
답하세요.

답변은 반드시 다음 형식으로, 첫 단어로 결론부터 말하세요(그 뒤에 검색으로 확인한 근거를 한두 문장으로):
"CUT: (근거)" 또는 "INCREASE: (근거)" 또는 "NONE"

검색 결과가 영어 뉴스여도 (근거) 부분은 반드시 한국어로 번역해서 쓰세요.`;

const MODEL = "gemini-2.5-flash";
const CALL_TIMEOUT_MS = 12000;

type GeminiCandidate = {
  content?: { parts?: { text?: string }[] };
  groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] };
};

function endpoint(apiKey: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
}

// 티커 하나당 그라운딩(웹검색) 호출 하나. 여러 티커를 한 호출에 몰아넣으면(배치) 검색이
// 티커 수만큼 순차적으로 늘어져서(10개 배치 실측 44초) 오히려 개별 호출을 병렬로 돌리는
// 게 더 빠르다(1개 실측 ~7초, 병렬이면 전체 소요시간도 그 정도).
async function searchOne(apiKey: string, ticker: string): Promise<RiskSignal | null> {
  const res = await fetch(endpoint(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SEARCH_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: `검사할 티커: ${ticker}` }] }],
      tools: [{ google_search: {} }],
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const candidate: GeminiCandidate | undefined = (await res.json())?.candidates?.[0];
  const text = candidate?.content?.parts?.find((p) => typeof p.text === "string")?.text;
  if (!text) return null;

  // 프롬프트에서 요구한 "CUT:"/"INCREASE:"/"NONE" 선언을 답변 맨 앞에서만 찾는다. 본문 중간에
  // "dividend_cut"이라는 단어가 (그게 아니라고 부정하는 문장에서라도) 나오면 걸리는 단순
  // 포함검사(includes)는 오탐이 나서, 첫 단어로 내려진 결론만 신뢰하도록 바꿨다.
  const verdict = text.trim().match(/^(CUT|INCREASE|NONE)\b/i)?.[1]?.toUpperCase();
  if (verdict !== "CUT" && verdict !== "INCREASE") return null;
  const signal = verdict === "CUT" ? "dividend_cut" : "dividend_increase";

  // 모델이 출처 URL을 답변 문장에 직접 적지 않는 경우가 많다(그라운딩 인용은 텍스트가 아니라
  // groundingMetadata로 따로 온다). 그래서 실제로 검색해서 인용한 출처(groundingChunks)를
  // 근거로 쓰고, 인용이 하나도 없으면 근거 없는 주장으로 보고 버린다(환각 방지와 같은 원칙).
  const sourceUrl = candidate?.groundingMetadata?.groundingChunks?.find((c) => c.web?.uri)?.web
    ?.uri;
  if (!sourceUrl) return null;

  const reason = text.trim().replace(/^(CUT|INCREASE)\b[:\-\s]*/i, "").trim();
  return { ticker, signal, reason, source_url: sourceUrl };
}

/**
 * 티커별 최신 배당 리스크/호재 검색. 그라운딩(웹검색) 결과라 신뢰도가 100%는 아니므로,
 * 이 결과로 배분을 자동으로 바꾸지 않고 참고 정보로만 노출한다. 개별 호출이 실패/타임아웃
 * 되어도 플랜 생성 자체를 막으면 안 되므로 그 티커만 조용히 빼고 넘어간다(fail-open).
 */
export async function screenRisks(tickers: string[]): Promise<Record<string, RiskSignal>> {
  const unique = [...new Set(tickers)];
  const apiKey = process.env.GEMINI_API_KEY;
  if (unique.length === 0 || !apiKey) return {};

  const found = await Promise.all(
    unique.map((ticker) => searchOne(apiKey, ticker).catch(() => null))
  );

  const result: Record<string, RiskSignal> = {};
  for (const signal of found) {
    if (signal) result[signal.ticker] = signal;
  }
  return result;
}
