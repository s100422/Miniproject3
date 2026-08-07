export type DividendStock = {
  ticker: string;
  name: string;
  dividend_yield: number;
  consecutive_years: number;
  sector: string;
  payout_months: number[];
};

export type PlanInput = {
  target_monthly_dividend: number;
  monthly_investment: number;
};

export type Candidate = {
  concept: string;
  allocations: { ticker: string; weight_pct: number }[];
  advice_text: string;
};

const SYSTEM_INSTRUCTION = `당신은 배당투자 플래너 AI입니다. 사용자의 목표와 아래 제공된 배당주 리스트만 사용해서
포트폴리오 배분안 2가지를 제안하세요.

규칙:
1. allocations에 사용하는 티커는 반드시 제공된 리스트 안에 있는 것만 사용하세요.
   리스트에 없는 종목은 절대 만들어내지 마세요.
2. 매달 배당이 들어오는 게 이 서비스의 핵심 가치입니다. 각 종목의 payout_months(실제
   배당 지급월)를 참고해서, 후보 하나의 allocations에 포함된 종목들의 payout_months를
   전부 합쳤을 때 1월부터 12월까지 빠짐없이 커버되도록 구성하세요.
3. weight_pct의 합은 정확히 100이어야 합니다.
4. 두 후보는 서로 다른 트레이드오프를 가져야 합니다(예: 하나는 우량주 중심으로 균형있게,
   다른 하나는 고배당 위주로 예산을 아끼는 방향 등). concept 필드에 한 줄로 그 차이를
   요약하세요.
5. 금액 계산(연차별 배당금, 목표 도달 시점)은 당신이 하지 않습니다 — 서버가 별도로
   계산합니다. 당신은 배분과 조언만 담당합니다. 목표 도달 가능성을 판단하지 마세요.
6. advice_text에는 배분 이유와 함께 전략적 매수/매도 조언을 1~2문장 포함하세요.

다른 텍스트 없이 아래 JSON 형식으로만 응답하세요.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    candidates: {
      type: "ARRAY",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "OBJECT",
        properties: {
          concept: { type: "STRING" },
          allocations: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                ticker: { type: "STRING" },
                weight_pct: { type: "NUMBER" },
              },
              required: ["ticker", "weight_pct"],
            },
          },
          advice_text: { type: "STRING" },
        },
        required: ["concept", "allocations", "advice_text"],
      },
    },
  },
  required: ["candidates"],
};

function buildUserPrompt(input: PlanInput, stocks: DividendStock[]): string {
  return `목표 월배당금액: $${input.target_monthly_dividend}
월 투자계획금액(고정): $${input.monthly_investment}
사용 가능한 배당주 리스트(JSON): ${JSON.stringify(
    stocks.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      dividend_yield: s.dividend_yield,
      consecutive_years: s.consecutive_years,
      sector: s.sector,
      payout_months: s.payout_months,
    }))
  )}`;
}

const MODEL = "gemini-2.5-flash";

export async function callGemini(
  input: PlanInput,
  stocks: DividendStock[]
): Promise<Candidate[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(input, stocks) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API 호출 실패: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 응답이 비어있습니다.");

  const parsed = JSON.parse(text);
  const candidates = parsed?.candidates;
  if (!Array.isArray(candidates) || candidates.length !== 2) {
    throw new Error("Gemini 응답 형식이 스키마와 맞지 않습니다.");
  }
  return candidates;
}

export function validateCandidate(
  candidate: Candidate,
  stocks: DividendStock[]
): { valid: boolean; reason?: string } {
  const stockMap = new Map(stocks.map((s) => [s.ticker, s]));

  for (const a of candidate.allocations) {
    if (!stockMap.has(a.ticker)) {
      return { valid: false, reason: `환각 티커: ${a.ticker}` };
    }
  }

  const weightSum = candidate.allocations.reduce((sum, a) => sum + a.weight_pct, 0);
  if (Math.abs(weightSum - 100) > 0.5) {
    return { valid: false, reason: `비중 합계가 100이 아님: ${weightSum}` };
  }

  const coveredMonths = new Set(
    candidate.allocations.flatMap((a) => stockMap.get(a.ticker)!.payout_months)
  );
  const missingMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(
    (m) => !coveredMonths.has(m)
  );
  if (missingMonths.length > 0) {
    return { valid: false, reason: `배당 지급월이 비어있는 달: ${missingMonths.join(",")}` };
  }

  return { valid: true };
}
