import { grade, type Grade } from "./dividendScore";
import { estimatedAnnualDividend, type EstimateCatalogStock, type EstimateReceipt } from "./holdingsDividendEstimate";
import type { TickerAnalysis } from "./tickerAnalysis";

/**
 * 포트폴리오 레벨 진단. **AI를 한 줄도 쓰지 않는다** — 숫자는 전부 여기서 계산하고,
 * 나중에 붙을 서술 계층은 이 숫자를 인용해 문장만 쓴다(docs/ROADMAP.md Phase 3).
 *
 * 핵심은 **배당 기준으로 본다**는 것이다. "10종목 중 2개가 위험"은 계획을 안 깨지만
 * "내 배당의 32%가 위험 종목에서 나온다"는 깬다. 평가금액 비중과 배당 비중은 다르다 —
 * 저배당 대형주가 평가금액의 절반이어도 배당은 얼마 안 될 수 있다.
 */

export type Tier = "risk" | "warn" | "ok" | "unanalyzed";

/**
 * 3단계로 나눈다. 하나로 합치면 어느 쪽으로 정하든 못 쓴다 — 역검증된 신호(배당함정·경계)만
 * 세면 카탈로그에 걸리는 종목이 거의 없어 늘 0%로 뜨고, 주의 등급까지 넓히면 카탈로그의 19%가
 * 해당돼서 대부분의 포트폴리오가 "80% 위험"으로 나온다. 둘 다 행동을 못 고르게 한다.
 *
 * - `risk`  배당함정 또는 경계 등급. **실제 삭감 사례로 역검증된 신호**(로드맵 Phase 1 ③)
 * - `warn`  플래그가 하나라도 있거나 주의 등급. 삭감 신호는 아니고 지켜볼 이유가 있는 것
 * - `unanalyzed` 점수를 못 낸 종목. **조용히 빼면 노출도가 실제보다 낮게 나온다**
 */
function classify(analysis: TickerAnalysis | undefined, g: Grade, flags: string[]): Tier {
  if (!analysis || analysis.status === "failed" || g === "미분석") return "unanalyzed";
  if (flags.includes("dividend_trap") || g === "경계") return "risk";
  if (flags.length > 0 || g === "주의") return "warn";
  return "ok";
}

export type DiagnosisHolding = { ticker: string; name: string; marketValue: number };
export type DiagnosisCatalogStock = EstimateCatalogStock & { name?: string; sector?: string | null };

export type HoldingDiagnosis = DiagnosisHolding & {
  annualDividend: number;
  /** 이 종목이 내 연배당에서 차지하는 비중(%). */
  dividendShare: number;
  score: number | null;
  grade: Grade;
  flags: string[];
  tier: Tier;
  sector: string;
};

export type TierSummary = { share: number; annualDividend: number; tickers: string[] };

export type Action = {
  kind: "reduce" | "expand" | "new";
  ticker: string;
  name: string;
  /** 근거 지표. **표현은 "검토 대상"으로 통일한다** — 사라/팔아라는 개인화된 투자자문이다. */
  reason: string;
};

export type Diagnosis = {
  holdings: HoldingDiagnosis[];
  annualDividend: number;
  byTier: Record<Tier, TierSummary>;
  /** 배당가중 평균 안전성. 점수 없는 종목은 분모에서 빠지므로 `safetyCoverage`와 같이 읽어야 한다. */
  weightedSafety: number | null;
  /** 위 평균이 내 배당의 몇 %를 반영하나. 미분석이 많으면 평균 자체가 못 믿을 값이 된다. */
  safetyCoverage: number;
  /** 섹터 집중도(HHI, 0~10000). 평가금액 기준 — 집중 위험은 배당이 아니라 자산이 쏠린 문제다. */
  sectorHhi: number;
  topSector: { sector: string; share: number } | null;
  /** 배당이 한 푼도 안 들어오는 달. */
  emptyMonths: number[];
  actions: Action[];
};

const EMPTY_TIER = (): TierSummary => ({ share: 0, annualDividend: 0, tickers: [] });

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

export function diagnosePortfolio({
  holdings,
  analysis,
  catalog,
  receipts,
  now,
}: {
  holdings: DiagnosisHolding[];
  analysis: Record<string, TickerAnalysis>;
  catalog: Record<string, DiagnosisCatalogStock>;
  receipts: EstimateReceipt[];
  now: Date;
}): Diagnosis {
  const scored = holdings.map((h) => {
    const a = analysis[h.ticker];
    const score = a?.status === "failed" ? null : (a?.total_score ?? null);
    const flags = a?.metrics?.flags ?? [];
    const g = grade(score);
    return {
      ...h,
      annualDividend: estimatedAnnualDividend(h.ticker, h.marketValue, catalog[h.ticker], receipts, now),
      dividendShare: 0,
      score,
      grade: g,
      flags,
      tier: classify(a, g, flags),
      sector: catalog[h.ticker]?.sector || "미상",
    };
  });

  const annualDividend = scored.reduce((s, h) => s + h.annualDividend, 0);
  for (const h of scored) h.dividendShare = pct(h.annualDividend, annualDividend);

  const byTier: Record<Tier, TierSummary> = {
    risk: EMPTY_TIER(),
    warn: EMPTY_TIER(),
    ok: EMPTY_TIER(),
    unanalyzed: EMPTY_TIER(),
  };
  for (const h of scored) {
    const t = byTier[h.tier];
    t.annualDividend += h.annualDividend;
    t.tickers.push(h.ticker);
  }
  for (const t of Object.values(byTier)) t.share = pct(t.annualDividend, annualDividend);

  // 점수 있는 종목만 배당으로 가중한다. 미분석을 0점으로 치면 없는 위험을 지어내는 것이고,
  // 100점으로 치면 없는 안전을 지어내는 것이다. 대신 커버리지를 같이 돌려준다.
  const withScore = scored.filter((h) => h.score != null);
  const scoredDividend = withScore.reduce((s, h) => s + h.annualDividend, 0);
  const weightedSafety =
    scoredDividend > 0
      ? Math.round(
          (withScore.reduce((s, h) => s + h.score! * h.annualDividend, 0) / scoredDividend) * 10
        ) / 10
      : null;

  const totalValue = scored.reduce((s, h) => s + h.marketValue, 0);
  const bySector = new Map<string, number>();
  for (const h of scored) bySector.set(h.sector, (bySector.get(h.sector) ?? 0) + h.marketValue);
  const sectorShares = [...bySector.entries()]
    .map(([sector, value]) => ({ sector, share: pct(value, totalValue) }))
    .sort((a, b) => b.share - a.share);
  const sectorHhi = Math.round(sectorShares.reduce((s, x) => s + x.share * x.share, 0));

  const paidMonths = new Set(
    scored.flatMap((h) => (h.annualDividend > 0 ? (catalog[h.ticker]?.payout_months ?? []) : []))
  );
  const emptyMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !paidMonths.has(m));

  return {
    holdings: scored,
    annualDividend,
    byTier,
    weightedSafety,
    safetyCoverage: pct(scoredDividend, annualDividend),
    sectorHhi,
    topSector: sectorShares[0] ?? null,
    emptyMonths,
    actions: buildActions(scored, analysis, catalog, emptyMonths),
  };
}

/**
 * 규칙 기반 액션 후보 3종. **정답이 아니라 "먼저 들여다볼 곳"이다** — 근거 지표를 항상 같이
 * 내보내서 사용자가 직접 판단할 수 있게 한다(로드맵 "지키기로 한 것").
 */
function buildActions(
  scored: HoldingDiagnosis[],
  analysis: Record<string, TickerAnalysis>,
  catalog: Record<string, DiagnosisCatalogStock>,
  emptyMonths: number[]
): Action[] {
  const actions: Action[] = [];

  // ① 축소 검토 — **점수만 보면 안 되고 배당 비중만 봐도 안 된다.** 점수가 제일 낮아도
  //    배당의 5%만 대는 종목은 삭감돼도 계획이 안 깨지고, 비중이 커도 안전한 종목은 손댈
  //    이유가 없다. 둘을 곱한 `(100 − 점수) × 배당비중`으로 "삭감 시 잃을 게 큰 순서"를 만든다.
  //    등급은 그 위에 있다 — 역검증된 위험 신호가 있으면 비중과 무관하게 먼저 본다.
  const exposure = (h: HoldingDiagnosis) => (100 - (h.score ?? 0)) * h.dividendShare;
  const byExposure = (a: HoldingDiagnosis, b: HoldingDiagnosis) => exposure(b) - exposure(a);
  const pool = scored.filter((h) => h.tier === "risk");
  const fallback = scored.filter((h) => h.tier === "warn");
  const target = (pool.length ? [...pool] : [...fallback]).sort(byExposure)[0];
  if (target && target.dividendShare > 0) {
    actions.push({
      kind: "reduce",
      ticker: target.ticker,
      name: target.name,
      reason: `안전성 ${target.score ?? "—"}점(${target.grade})인데 내 연배당의 ${target.dividendShare}%가 여기서 나온다.`,
    });
  }

  // ② 확대 검토 — 안전한데 배당 기여가 평균 미만인 종목. "좋은 걸 적게 갖고 있다"는 자리다.
  const okHoldings = scored.filter((h) => h.tier === "ok");
  const avgShare = scored.length ? 100 / scored.length : 0;
  const expand = [...okHoldings]
    .filter((h) => h.dividendShare < avgShare)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (expand) {
    actions.push({
      kind: "expand",
      ticker: expand.ticker,
      name: expand.name,
      reason: `안전성 ${expand.score}점(${expand.grade})으로 보유 종목 중 상위인데 내 연배당의 ${expand.dividendShare}%뿐이다.`,
    });
  }

  // ③ 신규 편입 검토 — 미보유 카탈로그 종목 중 점수 상위. 배당이 안 들어오는 달이 있으면
  //    그 달을 메우는 종목을 먼저 본다. 공백 메우기가 점수 1~2점 차이보다 크게 작동한다.
  const held = new Set(scored.map((h) => h.ticker));
  const candidates = Object.values(analysis)
    .filter((a) => !held.has(a.ticker) && a.status !== "failed" && a.total_score != null)
    .sort((a, b) => b.total_score! - a.total_score!);
  const fillsGap = emptyMonths.length
    ? candidates.find((a) =>
        (catalog[a.ticker]?.payout_months ?? []).some((m) => emptyMonths.includes(m))
      )
    : undefined;
  const pick = fillsGap ?? candidates[0];
  if (pick) {
    const months = (catalog[pick.ticker]?.payout_months ?? []).filter((m) => emptyMonths.includes(m));
    actions.push({
      kind: "new",
      ticker: pick.ticker,
      name: catalog[pick.ticker]?.name ?? pick.ticker,
      reason: months.length
        ? `안전성 ${pick.total_score}점이고, 지금 배당이 안 들어오는 ${months.join("·")}월에 지급한다.`
        : `안전성 ${pick.total_score}점으로 카탈로그 상위인데 아직 보유하지 않았다.`,
    });
  }

  return actions;
}
