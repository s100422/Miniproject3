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
  preference?: string;
};

export type Candidate = {
  concept: string;
  allocations: { ticker: string; weight_pct: number; reason: string }[];
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
3. 특정 섹터에 비중을 몰아넣지 마세요. 각 종목의 sector 정보를 참고해서, 후보 하나에서
   같은 섹터의 weight_pct 합계가 40%를 넘지 않도록 섹터를 분산해서 담으세요.
4. weight_pct의 합은 정확히 100이어야 합니다.
5. 각 종목의 weight_pct는 그 종목의 dividend_yield(배당수익률)와 consecutive_years(연속
   증가연수)가 높을수록, 그리고 12개월 커버리지를 위해 꼭 필요한 종목일수록 높게 주세요.
   목표 월배당금액에 최대한 근접시키는 게 목적이므로, 낮은 배당·저성장 종목에까지 비중을
   고르게 얇게 펴지 마세요 — 규칙 3의 섹터 40% 한도 안에서는 상위 종목에 비중을 최대한
   몰아주고, 나머지 종목은 12개월 커버리지에 필요한 최소 비중만 주는 쪽을 우선하세요.
   allocations의 각 항목에 reason 필드를 추가해서, 그 종목의 실제 dividend_yield 또는
   consecutive_years 숫자를 반드시 인용해서 왜 이 비중을 줬는지 한 문장으로 설명하세요.
   숫자를 인용하지 않은 추상적인 설명은 안 됩니다.
6. 두 후보는 서로 다른 트레이드오프를 가져야 합니다(예: 하나는 우량주 중심으로 균형있게,
   다른 하나는 고배당 위주로 예산을 아끼는 방향 등). concept 필드에 한 줄로 그 차이를
   요약하세요.
7. 금액 계산(연차별 배당금, 목표 도달 시점)은 당신이 하지 않습니다 — 서버가 별도로
   계산합니다. 당신은 배분과 조언만 담당합니다. 목표 도달 가능성을 판단하지 마세요.
8. advice_text에는 배분 이유와 함께 전략적 매수/매도 조언을 1~2문장 포함하세요.
9. 사용자가 "선호/제외 조건"을 추가로 남길 수 있습니다. 이 조건은 참고해서 반영하되,
   위 1~4번 규칙(리스트 안 종목만 사용, 12개월 커버리지, 섹터 40% 이하, 비중합 100)이
   항상 우선합니다. 조건을 지키면 1~4번 규칙이 깨지는 경우엔 그 조건을 무시하고, 왜
   반영하지 못했는지 advice_text에 한 문장으로 설명하세요.

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
                reason: { type: "STRING" },
              },
              required: ["ticker", "weight_pct", "reason"],
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
  const preferenceLine = input.preference?.trim()
    ? `\n선호/제외 조건: ${input.preference.trim()}`
    : "";
  return `목표 월배당금액: $${input.target_monthly_dividend}
월 투자계획금액(고정): $${input.monthly_investment}${preferenceLine}
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

// reason에 그 종목의 실제 dividend_yield 또는 consecutive_years 숫자가 인용됐는지 확인한다.
// 인용된 숫자가 실제 데이터와 다르면(혹은 숫자가 아예 없으면) 근거 없이 지어낸 설명으로 본다.
function citesRealData(reason: string | undefined, stock: DividendStock): boolean {
  // `reason`이 스키마상 필수여도 응답에 없을 수 있다. 여기서 예외를 던지면 이 함수가 막으려던
  // 바로 그 불량 응답이 502(검증 실패)가 아니라 처리 안 된 500으로 나간다.
  const numbers = typeof reason === "string" ? (reason.match(/\d+(\.\d+)?/g)?.map(Number) ?? []) : [];
  return numbers.some(
    (n) => n === stock.consecutive_years || Math.abs(n - stock.dividend_yield) < 0.15
  );
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
    if (!citesRealData(a.reason, stockMap.get(a.ticker)!)) {
      return { valid: false, reason: `근거 없는 비중 설명: ${a.ticker}` };
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
