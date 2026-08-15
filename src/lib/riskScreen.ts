import { mapLimit } from "./stockPrice";

/**
 * 종목별 뉴스 스크리닝. **숫자로 안 잡히는 악재**를 잡는 계층이라 점수와 역할이 겹치지 않는다
 * (docs/ROADMAP.md Phase 2). 배당컷/인상만 보던 걸 실적·가이던스·신용등급·소송·규제·M&A까지 넓혔다.
 */

export type NewsKind =
  | "dividend_cut"
  | "dividend_increase"
  | "earnings"
  | "guidance"
  | "credit_rating"
  | "litigation"
  | "regulation"
  | "m_and_a";

export type NewsEvent = {
  kind: NewsKind;
  /** 배당 지속 관점에서 나쁜 소식인지 좋은 소식인지. 실적·가이던스는 종류만으론 방향을 모른다. */
  impact: "negative" | "positive";
  reason: string;
  source_url: string;
};

const KINDS = new Set<string>([
  "dividend_cut",
  "dividend_increase",
  "earnings",
  "guidance",
  "credit_rating",
  "litigation",
  "regulation",
  "m_and_a",
]);

/** 티커당 저장 상한. 화면이 배지 옆에 붙이는 용도라 3건이 넘어가면 읽히지 않는다. */
const MAX_EVENTS = 3;

const SEARCH_INSTRUCTION = `당신은 배당주 뉴스 스크리너입니다. 주어진 티커에 대해 최근 6개월 이내에
실제로 발표된 아래 종류의 사건만 웹 검색으로 확인하세요.

- DIVIDEND_CUT: 배당 삭감 또는 중단 발표
- DIVIDEND_INCREASE: 배당 인상 발표
- EARNINGS: 분기 실적이 시장 기대를 크게 웃돌거나 밑돈 경우
- GUIDANCE: 회사가 실적 전망을 상향 또는 하향 조정
- CREDIT_RATING: 신용등급 또는 등급 전망 변경
- LITIGATION: 중대한 소송 제기·판결·합의
- REGULATION: 규제 조치, 당국 조사, 제재
- M_AND_A: 인수·합병·대규모 사업부 매각 발표

일반적인 시황 논평, 애널리스트 목표주가 조정, 단순 주가 변동은 사건이 아닙니다.
애매하면 무조건 빼세요. 확인된 사건이 하나도 없으면 NONE 한 단어만 답하세요.

사건이 있으면 중요한 것부터 최대 3건까지, 한 줄에 하나씩 아래 형식으로만 쓰세요.

종류|부호|근거

- 부호는 배당 지속에 나쁜 소식이면 -, 좋은 소식이면 +
- 근거는 한국어 한두 문장. 발표 시점과 수치를 포함하세요. 영어 기사여도 한국어로 옮겨 쓰세요.
- 형식 외의 머리말·맺음말·목록기호를 쓰지 마세요.

예: EARNINGS|-|2026년 5월 발표한 1분기 EPS가 시장 예상치를 12% 밑돌았다.`;

const MODEL = "gemini-2.5-flash";
const CALL_TIMEOUT_MS = 12000;

/** Gemini 그라운딩 동시 호출 상한. 86종목을 전량 병렬로 던지면 레이트리밋에 걸린다. */
export const NEWS_CONCURRENCY = 12;

type GroundingMetadata = {
  groundingChunks?: { web?: { uri?: string } }[];
  /** 응답 텍스트의 어느 구간이 어느 chunk에서 나왔는지. 건별 출처 귀속에 쓴다. */
  groundingSupports?: { segment?: { text?: string }; groundingChunkIndices?: number[] }[];
};

type GeminiCandidate = {
  content?: { parts?: { text?: string }[] };
  groundingMetadata?: GroundingMetadata;
};

function endpoint(apiKey: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
}

/**
 * 사건 한 건의 출처를 찾는다. 모델은 답변 문장에 URL을 적지 않고, 실제 인용은
 * `groundingSupports`가 "이 문장 구간 → 이 chunk" 형태로 따로 준다. 그래서 근거 문장과
 * 겹치는 구간을 찾아 그 chunk의 URL을 쓴다.
 *
 * **아무 chunk나 갖다 붙이지 않는다.** 3건이 한 응답에서 나오므로 첫 chunk를 전건에 재사용하면
 * 소송 근거에 배당 기사 링크가 붙는 오귀속이 생긴다. 인용을 못 찾으면 근거 없는 주장으로 보고
 * 버린다(기존 "출처 URL 필수" 원칙 그대로). 예외는 chunk가 하나뿐일 때 — 귀속이 모호하지 않다.
 */
function sourceFor(reason: string, meta: GroundingMetadata | undefined): string | null {
  const chunks = meta?.groundingChunks ?? [];
  const support = meta?.groundingSupports?.find((s) => {
    const seg = s.segment?.text?.trim();
    return !!seg && (reason.includes(seg) || seg.includes(reason));
  });
  const index = support?.groundingChunkIndices?.[0];
  if (index != null && chunks[index]?.web?.uri) return chunks[index].web!.uri!;

  const withUri = chunks.filter((c) => c.web?.uri);
  return withUri.length === 1 ? withUri[0].web!.uri! : null;
}

/**
 * 응답 텍스트를 사건 목록으로. `responseSchema`는 `google_search`와 같이 못 써서
 * (docs/DATABASE.md) JSON 대신 줄 단위 형식을 파싱한다. 형식에 안 맞는 줄은 조용히 버린다 —
 * 모델이 머리말이나 맺음말을 붙이는 경우가 있고, 그걸 사건으로 오인하면 안 된다.
 */
export function parseNews(text: string, meta: GroundingMetadata | undefined): NewsEvent[] {
  const events: NewsEvent[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^([A-Za-z_]+)\s*\|\s*([+-])\s*\|\s*(.+)$/);
    if (!m) continue;

    const kind = m[1].toLowerCase();
    if (!KINDS.has(kind)) continue;

    const reason = m[3].trim();
    const source_url = sourceFor(reason, meta);
    if (!source_url) continue;

    events.push({ kind: kind as NewsKind, impact: m[2] === "-" ? "negative" : "positive", reason, source_url });
    if (events.length === MAX_EVENTS) break;
  }
  return events;
}

/** 티커 하나당 그라운딩(웹검색) 호출 하나. 여러 티커를 한 호출에 몰아넣으면(배치) 검색이
 * 티커 수만큼 순차적으로 늘어져서(10개 배치 실측 44초) 오히려 개별 호출을 병렬로 돌리는
 * 게 더 빠르다(1개 실측 ~7초). 실패는 `null`로 돌려 "검사 못 함"과 "사건 없음"을 구분한다. */
async function searchOne(apiKey: string, ticker: string): Promise<NewsEvent[] | null> {
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

  return parseNews(text, candidate?.groundingMetadata);
}

/**
 * 티커별 최신 뉴스 검색. 그라운딩 결과라 신뢰도가 100%는 아니므로 이 결과로 점수나 배분을
 * 자동으로 바꾸지 않고 근거 링크와 함께 참고 정보로만 노출한다.
 *
 * **실패한 티커는 결과에서 아예 빠진다**(fail-open). 빈 배열로 돌려주면 "검사했는데 사건이
 * 없다"와 구분이 안 돼서, 검사에 실패한 종목이 화면에서 깨끗한 종목처럼 보인다.
 *
 * `deadline`이 지나면 남은 티커는 호출하지 않고 넘긴다. 서버리스 실행시간 상한에 걸려
 * 함수가 통째로 죽으면 **끝난 종목의 결과까지 같이 날아가기** 때문이다.
 */
export async function screenNews(
  tickers: string[],
  deadline = Date.now() + 40_000
): Promise<Record<string, NewsEvent[]>> {
  const unique = [...new Set(tickers)];
  const apiKey = process.env.GEMINI_API_KEY;
  if (unique.length === 0 || !apiKey) return {};

  const found = await mapLimit(unique, NEWS_CONCURRENCY, (ticker) =>
    Date.now() > deadline ? Promise.resolve(null) : searchOne(apiKey, ticker).catch(() => null)
  );

  const result: Record<string, NewsEvent[]> = {};
  unique.forEach((ticker, i) => {
    const events = found[i];
    if (events) result[ticker] = events;
  });
  return result;
}
