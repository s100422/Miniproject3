"use client";

import { grade } from "@/lib/dividendScore";
import {
  daysSince,
  FLAG_LABEL,
  NEWS_KIND_LABEL,
  STALE_DAYS,
  type NewsEvent,
  type TickerAnalysis,
} from "@/lib/tickerAnalysis";

/** 등급별 색. 4단계라 secondary(안전)와 error(경계) 사이에 warning 한 칸이 들어간다. */
const GRADE_STYLE: Record<string, string> = {
  안전: "bg-secondary-container text-on-secondary-container",
  양호: "bg-surface-container-high text-on-surface",
  주의: "bg-warning-container text-on-warning-container",
  경계: "bg-error-container text-on-error-container",
  미분석: "bg-surface-container text-on-surface-variant",
};

/**
 * 안전성 배지. **점수를 못 낸 종목은 조용히 빼지 않고 "미분석"으로 명시한다** —
 * 빼버리면 화면에서 사라져서 위험 노출도가 실제보다 낮아 보인다(로드맵 86줄).
 */
export function ScoreBadge({
  analysis,
  showScore = true,
}: {
  analysis: TickerAnalysis | undefined;
  showScore?: boolean;
}) {
  const total = analysis?.status === "failed" ? null : (analysis?.total_score ?? null);
  const g = grade(total);
  const flags = analysis?.metrics?.flags ?? [];
  const isTrap = flags.includes("dividend_trap");

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-label-md font-label-md font-bold ${GRADE_STYLE[g]}`}
      >
        {isTrap && <span className="material-symbols-outlined text-[14px]">warning</span>}
        {g}
        {showScore && total != null && <span className="font-normal">{total}</span>}
      </span>
    </span>
  );
}

/** 배지 옆에 붙는 플래그 칩들. 근거를 항상 같이 노출한다는 원칙(로드맵 81~84줄). */
export function FlagChips({ analysis }: { analysis: TickerAnalysis | undefined }) {
  const flags = analysis?.metrics?.flags ?? [];
  if (flags.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f}
          className={`rounded-full px-2 py-0.5 text-label-md font-label-md ${
            f === "dividend_trap"
              ? "bg-error-container text-on-error-container"
              : "bg-surface-container text-on-surface-variant"
          }`}
        >
          {FLAG_LABEL[f] ?? f}
        </span>
      ))}
    </span>
  );
}

/**
 * AI가 쓴 점수 해설. **여기 있는 숫자는 전부 코드가 계산한 값이고, 프롬프트에 없던 숫자가
 * 섞인 문장은 저장 단계에서 이미 버려졌다**(`narrate.ts`의 검증 게이트).
 * 그래도 사람이 쓴 글이 아니라는 걸 화면에서 숨기지 않는다.
 */
export function ScoreNarrative({ analysis }: { analysis: TickerAnalysis | undefined }) {
  if (!analysis?.narrative) return null;
  return (
    <p className="rounded-xl bg-surface-container-low p-3 text-label-md font-label-md text-on-surface-variant">
      <span className="mr-1 font-bold text-primary">AI 해설</span>
      {analysis.narrative}
    </p>
  );
}

/**
 * 뉴스 칩. **점수로 안 잡히는 악재**가 배지 옆에 붙는 자리다(로드맵 Phase 2).
 *
 * 그라운딩 검색 결과라 100% 신뢰할 수 없으므로 근거 문장과 출처 링크를 항상 같이 노출한다 —
 * 사용자가 원문을 직접 확인할 수 있어야 한다(로드맵 "지키기로 한 것").
 * `news`가 `null`이면 아직 검사되지 않은 종목이라 아무것도 그리지 않는다.
 *
 * `compact`는 표 안에 들어갈 때. 근거 문장이 한두 문장이라 셀을 무너뜨려서 종류 라벨만 쓰고
 * 문장은 툴팁으로 돌린다.
 */
export function NewsChips({
  news,
  compact = false,
}: {
  news: NewsEvent[] | null | undefined;
  compact?: boolean;
}) {
  if (!news?.length) return null;

  const tone = (e: NewsEvent) =>
    e.impact === "negative"
      ? "bg-error-container text-on-error-container"
      : "bg-secondary-container text-on-secondary-container";

  if (compact) {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {news.map((e, i) => (
          <a
            key={i}
            href={e.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title={e.reason}
            className={`rounded-full px-2 py-0.5 text-label-md font-label-md underline ${tone(e)}`}
          >
            {NEWS_KIND_LABEL[e.kind] ?? e.kind}
          </a>
        ))}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {news.map((e, i) => (
        <div
          key={i}
          className={`flex flex-wrap items-center gap-2 rounded-lg p-2 text-label-md font-label-md ${tone(e)}`}
        >
          <span className="material-symbols-outlined text-base">
            {e.impact === "negative" ? "warning" : "trending_up"}
          </span>
          <span className="font-bold">{NEWS_KIND_LABEL[e.kind] ?? e.kind}</span>
          <span>{e.reason}</span>
          <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="underline">
            출처
          </a>
        </div>
      ))}
    </div>
  );
}

/**
 * 기준일 표시. 배치가 며칠째 실패하면 화면 값이 조용히 낡는데, 사용자는 그걸 알 방법이 없다.
 * 그래서 항상 기준일을 노출하고 STALE_DAYS를 넘기면 경고로 바꾼다(로드맵 85줄).
 */
export function AsOfNotice({ asOf }: { asOf: string | null }) {
  const days = daysSince(asOf);

  if (!asOf || days == null) {
    return (
      <p className="rounded-xl bg-error-container px-4 py-3 text-body-md font-body-md text-on-error-container">
        분석 데이터가 아직 없어요. 야간 배치가 한 번도 성공하지 못한 상태예요.
      </p>
    );
  }

  const stale = days > STALE_DAYS;
  return (
    <p
      className={`text-label-md font-label-md ${
        stale
          ? "rounded-xl bg-error-container px-4 py-3 text-on-error-container"
          : "text-on-surface-variant"
      }`}
    >
      {stale && <span className="material-symbols-outlined mr-1 align-middle text-[16px]">warning</span>}
      분석 기준일 <strong>{asOf}</strong> (미국 종가 기준)
      {stale && ` — ${days}일째 갱신되지 않았어요. 아래 점수는 그때 값이에요.`}
    </p>
  );
}
