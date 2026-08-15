import type { DividendRates } from "./dividendRates";
import type { Fundamentals } from "./fundamentals";

/**
 * 보유 배당주 4축 점수. **AI를 한 줄도 쓰지 않는다** — 숫자는 전부 여기서 계산하고,
 * 나중에 AI가 붙더라도 이 숫자를 인용해 문장만 쓴다(docs/ROADMAP.md).
 *
 * 임계값은 전부 이 파일 맨 위 상수에 모아뒀다. **검증된 값이 아니라 가설이다** —
 * ticker_analysis에 점수 이력이 쌓이면 삭감 실적과 대조해 고칠 것.
 */

/**
 * 축 가중치. 로드맵에서 정한 초기 가설.
 * **화면이 이 값을 그대로 읽어 기준표를 그린다**(`ScoreCriteria`) — 여기만 고치면 화면도 따라온다.
 */
export const AXIS_WEIGHT = { safety: 40, growth: 25, strength: 20, value: 15 } as const;

/** 배당안전성 축의 소항목 가중치. 위와 같은 이유로 이름을 붙여 뺐다. */
export const SAFETY_PARTS = { payout: 45, netDebt: 30, years: 25 } as const;

/** 등급 컷. `grade()`와 화면 기준표가 같은 값을 쓴다. */
export const GRADE_CUTS = { safe: 75, good: 60, watch: 45 } as const;

/**
 * 배당성향(배당지급액 ÷ 영업현금흐름, %) 섹터별 기준선.
 * 분모가 순이익도 FCF도 아닌 OCF인 이유는 docs/DATABASE.md 참고 —
 * 순이익은 리츠에서, FCF는 유틸리티에서 구조적으로 깨진다.
 */
const PAYOUT_BANDS: Record<string, { good: number; warn: number; bad: number }> = {
  // 규제 유틸리티·금융은 현금흐름이 안정적인 대신 설비투자·자본규제로 여유가 적다
  Utilities: { good: 30, warn: 60, bad: 80 },
  Financials: { good: 30, warn: 60, bad: 80 },
  // 리츠는 과세소득의 90% 이상을 배당해야 하는 구조라 애초에 높은 게 정상이다
  "Real Estate": { good: 50, warn: 85, bad: 100 },
};
const DEFAULT_PAYOUT_BAND = { good: 35, warn: 70, bad: 90 };

/**
 * 배당함정 판정 기준. 셋을 **전부** 만족해야 한다 — 고배당은 그 자체로 위험이 아니다.
 *
 * 세 번째 조건이 로드맵 원안(배당성향 경고선 초과)과 다르다. 실제 삭감 사례로 역검증했더니
 * 원안이 둘 다 놓쳤다(dividendScore.backtest.check.ts):
 * - `LEG` 삭감 3개월 전 — 배당성향 48%로 멀쩡, 그런데 순부채/EBITDA 19.3에 이자보상 1.1
 * - `TDS` 동일 시점 — 배당성향 13%로 아주 멀쩡, 그런데 이자보상 -3.1(영업적자)
 * 배당귀족의 삭감은 현금이 말라서가 아니라 **재무구조·수익성이 무너져서** 온다.
 */
const TRAP = {
  yieldZ: 1.5,
  priceChange12m: -20,
  /** 아래 셋 중 하나라도 걸리면 "재무 스트레스". */
  netDebtToEbitda: 3.5,
  interestCoverage: 5,
} as const;

/** 성장 감속 경고선: 1년 CAGR이 5년 CAGR보다 이만큼(%p) 낮으면 플래그. */
const DECELERATION_FLAG = -5;

/** 배당함정 확정 시 배당안전성 축에서 깎는 점수. */
export const TRAP_PENALTY = 25;

export type ScoreInput = {
  ticker: string;
  sector: string;
  consecutive_years: number;
  rates: DividendRates | null;
  fundamentals: Fundamentals | null;
};

export type ScoreMetrics = {
  payout_ocf: number | null;
  payout_band: { good: number; warn: number; bad: number };
  net_debt_to_ebitda: number | null;
  interest_coverage: number | null;
  operating_margin: number | null;
  revenue_growth: number | null;
  capex_to_ocf: number | null;
  per: number | null;
  yield_z: number | null;
  growth_deceleration: number | null;
  fundamentals_as_of: string | null;
  missing: string[];
};

export type ScoreResult = {
  total: number | null;
  safety: number | null;
  growth: number | null;
  strength: number | null;
  value: number | null;
  status: "ok" | "partial" | "failed";
  flags: string[];
  metrics: ScoreMetrics;
};

/**
 * good이면 100점, bad면 0점, 사이는 직선 보간, 바깥은 잘라낸다.
 * good > bad로 주면 "높을수록 좋다", good < bad로 주면 "낮을수록 좋다"가 된다.
 */
function band(v: number | null, good: number, bad: number): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, ((v - bad) / (good - bad)) * 100));
}

/** 결측 항목은 빼고 남은 것끼리 가중평균한다(가중치 재정규화). 전부 비면 null. */
function weighted(parts: [number | null, number][]): number | null {
  const present = parts.filter((p): p is [number, number] => p[0] != null);
  const totalWeight = present.reduce((s, [, w]) => s + w, 0);
  if (totalWeight === 0) return null;
  return present.reduce((s, [v, w]) => s + v * w, 0) / totalWeight;
}

const ratio = (a: number | null, b: number | null): number | null =>
  a != null && b != null && b > 0 ? a / b : null;

function round1(n: number | null): number | null {
  return n != null ? Math.round(n * 10) / 10 : null;
}

/** 점수를 배지 등급으로. UI가 이 함수를 공유해서 컷이 화면마다 갈리지 않게 한다. */
export type Grade = "안전" | "양호" | "주의" | "경계" | "미분석";
export function grade(total: number | null): Grade {
  if (total == null) return "미분석";
  if (total >= GRADE_CUTS.safe) return "안전";
  if (total >= GRADE_CUTS.good) return "양호";
  if (total >= GRADE_CUTS.watch) return "주의";
  return "경계";
}

export function scoreTicker(input: ScoreInput): ScoreResult {
  const { sector, consecutive_years, rates, fundamentals: f } = input;
  const payoutBand = PAYOUT_BANDS[sector] ?? DEFAULT_PAYOUT_BAND;

  // ── 원지표 ────────────────────────────────────────────────────────────────
  const payoutOcf = (() => {
    const r = ratio(f?.dividendsPaid ?? null, f?.operatingCashflow ?? null);
    return r != null ? r * 100 : null;
  })();
  const netDebtToEbitda = (() => {
    // 순부채가 음수(현금이 부채보다 많음)면 부채 부담이 없는 것이므로 0으로 본다.
    if (f?.netDebt == null || f.ebitda == null || f.ebitda <= 0) return null;
    return Math.max(0, f.netDebt) / f.ebitda;
  })();
  const interestCoverage = ratio(f?.ebitda ?? null, f?.interestExpense ?? null);
  const operatingMargin = (() => {
    const r = ratio(f?.operatingIncome ?? null, f?.revenue ?? null);
    return r != null ? r * 100 : null;
  })();
  const revenueGrowth = (() => {
    const r = ratio(f?.revenue ?? null, f?.revenuePrev ?? null);
    return r != null ? (r - 1) * 100 : null;
  })();
  const capexToOcf = (() => {
    const r = ratio(f?.capex ?? null, f?.operatingCashflow ?? null);
    return r != null ? r * 100 : null;
  })();
  // 적자 기업의 음수 PER은 "싸다"가 아니라 "해석 불가"라서 버린다.
  const per = (() => {
    const eps = f?.dilutedEps ?? null;
    return rates?.price != null && eps != null && eps > 0 ? rates.price / eps : null;
  })();
  /** 지금 수익률이 자기 5년 평균에서 몇 표준편차 떨어져 있나. */
  const yieldZ = (() => {
    const { dividend_yield: y, yield_avg_5y: avg, yield_sd_5y: sd } = rates ?? {};
    return y != null && avg != null && sd != null && sd > 0 ? (y - avg) / sd : null;
  })();
  const deceleration =
    rates?.dividend_growth_1y != null && rates.dividend_growth_5y != null
      ? rates.dividend_growth_1y - rates.dividend_growth_5y
      : null;

  // ── 플래그 ────────────────────────────────────────────────────────────────
  const flags: string[] = [];
  // 재무 스트레스: 배당을 낼 현금이 없거나, 부채가 과하거나, 영업이익이 이자를 못 감당하거나.
  // 셋을 OR로 묶는 이유는 삭감이 이 중 어느 경로로든 오기 때문이다(위 TRAP 주석 참고).
  const financialStress =
    (payoutOcf != null && payoutOcf > payoutBand.warn) ||
    (netDebtToEbitda != null && netDebtToEbitda > TRAP.netDebtToEbitda) ||
    (interestCoverage != null && interestCoverage < TRAP.interestCoverage);
  if (financialStress) flags.push("financial_stress");

  // 배당함정: 수익률이 자기 역사 대비 튀었고(z), 주가가 크게 빠졌고, 재무까지 스트레스 상태.
  // 셋 중 하나만으로는 판정하지 않는다 — 주가가 빠졌다고 다 함정은 아니다.
  const isTrap =
    yieldZ != null &&
    yieldZ >= TRAP.yieldZ &&
    rates?.price_change_12m != null &&
    rates.price_change_12m <= TRAP.priceChange12m &&
    financialStress;
  if (isTrap) flags.push("dividend_trap");
  if (deceleration != null && deceleration <= DECELERATION_FLAG) flags.push("growth_deceleration");
  if (payoutOcf != null && payoutOcf > payoutBand.warn) flags.push("payout_warning");

  // ── 4축 ───────────────────────────────────────────────────────────────────
  const safetyBase = weighted([
    [band(payoutOcf, payoutBand.good, payoutBand.bad), SAFETY_PARTS.payout],
    [band(netDebtToEbitda, 1, 5), SAFETY_PARTS.netDebt],
    [band(consecutive_years, 50, 10), SAFETY_PARTS.years],
  ]);
  // 함정은 축 점수를 깎는 방식으로 반영한다. 소항목으로 넣으면 결측 재정규화에 휩쓸려
  // "다른 지표가 비면 함정 감점도 같이 희석되는" 사고가 난다.
  const safety =
    safetyBase != null ? Math.max(0, safetyBase - (isTrap ? TRAP_PENALTY : 0)) : null;

  const growth = weighted([
    [band(rates?.dividend_growth_5y ?? null, 10, 0), 40],
    [band(rates?.dividend_growth_1y ?? null, 10, 0), 30],
    [band(deceleration, 0, -8), 30],
  ]);

  const strength = weighted([
    [band(operatingMargin, 25, 5), 25],
    [band(revenueGrowth, 8, -5), 25],
    [band(interestCoverage, 12, 3), 25],
    [band(capexToOcf, 20, 90), 25],
  ]);

  const value = weighted([
    [band(per, 12, 30), 50],
    [band(yieldZ, 1.5, -1.5), 50],
  ]);

  const total = weighted([
    [safety, AXIS_WEIGHT.safety],
    [growth, AXIS_WEIGHT.growth],
    [strength, AXIS_WEIGHT.strength],
    [value, AXIS_WEIGHT.value],
  ]);

  const metrics: ScoreMetrics = {
    payout_ocf: round1(payoutOcf),
    payout_band: payoutBand,
    net_debt_to_ebitda: round1(netDebtToEbitda),
    interest_coverage: round1(interestCoverage),
    operating_margin: round1(operatingMargin),
    revenue_growth: round1(revenueGrowth),
    capex_to_ocf: round1(capexToOcf),
    per: round1(per),
    yield_z: round1(yieldZ),
    growth_deceleration: round1(deceleration),
    fundamentals_as_of: f?.asOfDate ?? null,
    missing: [
      ...(f?.missing ?? ["fundamentals"]),
      ...(rates ? [] : ["rates"]),
    ],
  };

  // 재무를 못 받으면 미분석이다. 카탈로그의 연속배당년수만으로도 숫자는 나오지만,
  // 그건 "40년 인상했으니 안전"이라는 근거 없는 판정이라 점수로 내보내면 안 된다.
  // 0점으로 두는 것도 안 된다 — "위험한 종목"으로 오독된다(로드맵 86줄).
  const failed = f == null || total == null;
  const status: ScoreResult["status"] = failed
    ? "failed"
    : metrics.missing.length > 0
      ? "partial"
      : "ok";

  return {
    total: failed ? null : round1(total),
    safety: failed ? null : round1(safety),
    growth: failed ? null : round1(growth),
    strength: failed ? null : round1(strength),
    value: failed ? null : round1(value),
    status,
    flags,
    metrics,
  };
}
