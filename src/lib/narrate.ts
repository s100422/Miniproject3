import { mapLimit } from "./stockPrice";
import type { TickerAnalysis } from "./tickerAnalysis";

/**
 * 점수 해설 생성. 로드맵의 마지막 계층이고, 원칙은 하나다 —
 * **숫자는 전부 코드가 계산하고 AI는 그 숫자를 인용해 문장만 쓴다.**
 *
 * 그래서 이 파일의 핵심은 프롬프트가 아니라 `verifyNarrative`다. 모델이 지어낸 숫자가 하나라도
 * 섞이면 문장을 통째로 버리고 점수만 남긴다(docs/ROADMAP.md). `gemini.ts`의 `citesRealData`가
 * 쓰는 패턴을 "프롬프트에 없던 숫자는 전부 환각"으로 넓힌 것이다.
 */

const MODEL = "gemini-2.5-flash";
const CALL_TIMEOUT_MS = 12000;

/** Gemini 동시 호출 상한. 웹검색이 없어 뉴스 배치보다 빠르지만 레이트리밋은 같이 받는다. */
export const NARRATE_CONCURRENCY = 12;

/** 이만큼도 인용 안 한 문장은 "숫자를 근거로 쓴 글"이 아니다. */
const MIN_CITATIONS = 2;

const INSTRUCTION = `당신은 배당주 분석 결과를 설명하는 도우미입니다. 아래에 주어진 수치만 근거로
2~3문장의 한국어 해설을 쓰세요.

절대 규칙:
- **주어진 수치 외의 숫자를 절대 쓰지 마세요.** 모르는 값은 언급하지 마세요.
- 수치는 주어진 그대로 옮겨 쓰세요. 반올림하거나 다른 단위로 바꾸지 마세요.
- 최소 두 개 이상의 수치를 문장 안에서 인용하세요.
- 주가 전망, 매수·매도 권유, "사세요/파세요"를 쓰지 마세요. 지금 상태와 지켜볼 지표만 쓰세요.
- 회사 이름·업황·뉴스 등 주어지지 않은 정보를 끌어오지 마세요.

무엇이 점수를 끌어내렸고 무엇이 받쳤는지, 그리고 앞으로 지켜볼 지표가 무엇인지 쓰세요.`;

const METRIC_LABEL: [key: string, label: string, unit: string][] = [
  ["payout_ocf", "배당성향(영업현금흐름 기준)", "%"],
  ["net_debt_to_ebitda", "순부채/EBITDA", "배"],
  ["interest_coverage", "이자보상배율", "배"],
  ["operating_margin", "영업이익률", "%"],
  ["revenue_growth", "매출성장률", "%"],
  ["capex_to_ocf", "설비투자/영업현금흐름", "%"],
  ["per", "PER", "배"],
  ["growth_deceleration", "배당성장 감속폭(1년 CAGR − 5년 CAGR)", "%p"],
];

export const FLAG_TEXT: Record<string, string> = {
  dividend_trap: "배당함정 의심",
  financial_stress: "재무 부담",
  payout_warning: "배당성향 경고선 초과",
  growth_deceleration: "배당 성장 둔화",
};

/**
 * 모델에 넘길 사실 블록. **검증은 이 문자열을 기준으로 한다** — 여기 안 나온 숫자가 답변에
 * 있으면 환각이다. 그래서 라벨에 박힌 숫자(`5년`)나 기준일(`2024-12-31`)까지 전부 이 안에 있고,
 * 검증기가 같은 문자열에서 허용 숫자를 뽑는다. 프롬프트와 검증이 갈라질 수 없는 구조다.
 */
export function buildFactBlock(row: TickerAnalysis): string {
  const lines: string[] = [`티커: ${row.ticker}`];
  const push = (label: string, value: number | null | undefined, unit = "") => {
    if (value != null) lines.push(`${label}: ${value}${unit}`);
  };

  push("종합 점수", row.total_score, "점");
  push("배당안전성 점수", row.safety_score, "점");
  push("배당성장성 점수", row.growth_score, "점");
  push("기업체력 점수", row.strength_score, "점");
  push("밸류에이션 점수", row.value_score, "점");
  push("배당수익률", row.dividend_yield, "%");
  push("5년 배당성장률(CAGR)", row.dividend_growth_5y, "%");

  const m = row.metrics ?? {};
  for (const [key, label, unit] of METRIC_LABEL) {
    push(label, (m as Record<string, number | null>)[key], unit);
  }
  if (m.payout_band) {
    push("이 종목 섹터의 배당성향 경고선", m.payout_band.warn, "%");
  }
  if (m.fundamentals_as_of) lines.push(`재무 기준일: ${m.fundamentals_as_of}`);

  const flags = (m.flags ?? []).map((f) => FLAG_TEXT[f] ?? f);
  if (flags.length) lines.push(`감지된 경고: ${flags.join(", ")}`);

  return lines.join("\n");
}

const numbersIn = (text: string): number[] =>
  (text.match(/\d+(\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);

/** 반올림해서 쓴 인용은 통과시킨다(62.3 → "62"). 없던 숫자를 만든 건 통과시키지 않는다. */
const cites = (fact: number, used: number) =>
  Math.abs(fact - used) < 0.05 || Math.round(fact) === used;

export type Verdict = { ok: boolean; cited: number; unknown: number[] };

/**
 * **프롬프트에 없던 숫자가 하나라도 있으면 버린다.** 사실 블록에 있는 값만 다시 쓸 수 있게
 * 하는 게 이 게이트의 전부다 — "그럴듯한데 틀린 수치"가 화면에 박히는 것보다 문장이 없는 편이 낫다.
 */
export function verifyNarrative(text: string, factBlock: string): Verdict {
  const allowed = numbersIn(factBlock);
  const used = numbersIn(text);
  const unknown = used.filter((n) => !allowed.some((a) => cites(a, n)));
  return { ok: unknown.length === 0 && used.length >= MIN_CITATIONS, cited: used.length, unknown };
}

function endpoint(apiKey: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
}

/**
 * 한 종목의 해설. 웹검색을 안 쓰므로 `responseSchema`를 쓸 수 있다 —
 * 뉴스 쪽이 줄 형식을 파싱해야 했던 제약(docs/DATABASE.md)이 여기엔 없다.
 */
async function narrateOne(apiKey: string, row: TickerAnalysis): Promise<string | null> {
  const factBlock = buildFactBlock(row);
  const res = await fetch(endpoint(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: factBlock }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: { narrative: { type: "STRING" } },
          required: ["narrative"],
        },
      },
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const text = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  let narrative: unknown;
  try {
    narrative = JSON.parse(text)?.narrative;
  } catch {
    return null;
  }
  if (typeof narrative !== "string" || !narrative.trim()) return null;

  return verifyNarrative(narrative, factBlock).ok ? narrative.trim() : null;
}

/**
 * 회차 전체의 해설. 실패한 티커와 **검증 게이트에서 버려진 티커는 결과에서 빠진다** —
 * 둘 다 `narrative`가 null로 남고, 점수는 그대로다.
 *
 * `deadline`이 지나면 남은 티커는 호출하지 않는다(뉴스 배치와 같은 이유).
 */
export async function narrateAll(
  rows: TickerAnalysis[],
  deadline = Date.now() + 40_000
): Promise<Record<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  // 점수를 못 낸 종목엔 인용할 숫자가 없다.
  const targets = rows.filter((r) => r.status !== "failed" && r.total_score != null);
  if (!apiKey || targets.length === 0) return {};

  const written = await mapLimit(targets, NARRATE_CONCURRENCY, (row) =>
    Date.now() > deadline ? Promise.resolve(null) : narrateOne(apiKey, row).catch(() => null)
  );

  const result: Record<string, string> = {};
  targets.forEach((row, i) => {
    const text = written[i];
    if (text) result[row.ticker] = text;
  });
  return result;
}
