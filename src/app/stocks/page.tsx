"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AsOfNotice,
  AxisScores,
  FlagChips,
  NewsChips,
  ScoreBadge,
  ScoreCriteria,
  ScoreNarrative,
} from "@/components/ScoreBadge";
import { fetchLatestAnalysis, type TickerAnalysis } from "@/lib/tickerAnalysis";

type Stock = {
  ticker: string;
  name: string;
  sector: string;
  dividend_yield: number;
  consecutive_years: number;
  payout_months: number[];
  business_summary: string;
};

const SECTOR_LABEL: Record<string, string> = {
  "Health Care": "헬스케어",
  Industrials: "산업재",
  Financials: "금융",
  "Real Estate": "부동산",
  "Consumer Staples": "소비재(필수)",
  "Consumer Discretionary": "소비재(임의)",
  Materials: "소재",
  Energy: "에너지",
  Utilities: "유틸리티",
  "Information Technology": "IT",
  "Communication Services": "통신",
};

/**
 * 실제로 널리 알려진 브랜드 컬러만 넣었다(대략 20개). 나머지 68개는 정확한 실제
 * 브랜드 컬러를 확신할 수 없어서 지어내지 않고 섹터 색(SECTOR_COLOR)으로 대체한다.
 */
const BRAND_COLOR: Record<string, { bg: string; text?: string }> = {
  KO: { bg: "#F40000" }, // Coca-Cola
  PEP: { bg: "#004B93" }, // PepsiCo
  PG: { bg: "#003DA5" }, // Procter & Gamble
  CL: { bg: "#ED1C24" }, // Colgate-Palmolive
  JNJ: { bg: "#CE0037" }, // Johnson & Johnson
  MDT: { bg: "#0066B3" }, // Medtronic
  WMT: { bg: "#0071CE" }, // Walmart
  TGT: { bg: "#CC0000" }, // Target
  LOW: { bg: "#004990" }, // Lowe's
  MCD: { bg: "#DA291C" }, // McDonald's
  IBM: { bg: "#0F62FE" }, // IBM
  CAT: { bg: "#FFCD11", text: "#171d1c" }, // Caterpillar (밝은 노랑이라 어두운 글씨)
  GWW: { bg: "#DA291C" }, // W.W. Grainger
  XOM: { bg: "#ED1C24" }, // ExxonMobil
  CVX: { bg: "#0055B8" }, // Chevron
  ABT: { bg: "#0057B8" }, // Abbott
  ABBV: { bg: "#A6093D" }, // AbbVie
  ADP: { bg: "#D22630" }, // ADP
  LIN: { bg: "#00539F" }, // Linde
};

/** 브랜드 컬러를 모르는 종목은 섹터별 색으로 최소한의 시각적 구분을 준다. */
const SECTOR_COLOR: Record<string, string> = {
  Industrials: "#52606D",
  "Consumer Staples": "#C17F27",
  Financials: "#1B3B6F",
  Utilities: "#1F7A5C",
  Materials: "#6B5B4D",
  "Consumer Discretionary": "#C4436B",
  "Health Care": "#0E7C86",
  Energy: "#B35C00",
  "Information Technology": "#4B3F8C",
  "Real Estate": "#4E7A3D",
  "Communication Services": "#8C3B7A",
};

function tickerColor(s: Stock): { bg: string; text: string } {
  const brand = BRAND_COLOR[s.ticker];
  if (brand) return { bg: brand.bg, text: brand.text ?? "#ffffff" };
  return { bg: SECTOR_COLOR[s.sector] ?? "#52606D", text: "#ffffff" };
}

function StockCard({
  s,
  analysis,
  featured = false,
}: {
  s: Stock;
  analysis: TickerAnalysis | undefined;
  featured?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden flex flex-col justify-between bg-surface-container-lowest rounded-2xl border border-surface-variant transition-shadow duration-300 hover:shadow-lg ${
        featured ? "p-stack-lg sm:p-8" : "p-stack-lg"
      }`}
    >
      {featured && (
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-secondary/5 blur-3xl" />
      )}

      <div className="relative z-10 flex justify-between items-start gap-stack-md mb-stack-md">
        <div className="flex items-center gap-stack-md min-w-0">
          <div
            className={`shrink-0 rounded-lg flex items-center justify-center font-bold ${
              featured ? "w-14 h-14 text-body-lg font-body-lg" : "w-10 h-10 text-label-md font-label-md"
            }`}
            style={{ backgroundColor: tickerColor(s).bg, color: tickerColor(s).text }}
          >
            {s.ticker}
          </div>
          <div className="min-w-0">
            <h3
              className={`font-bold text-primary ${
                featured
                  ? "text-headline-md font-headline-md"
                  : "text-body-lg font-body-lg truncate"
              }`}
            >
              {s.name}
            </h3>
            <p className="text-label-md font-label-md text-on-surface-variant">
              {SECTOR_LABEL[s.sector] ?? s.sector}
            </p>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="inline-flex items-center gap-1 bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-label-md font-label-md font-bold">
            <span className="material-symbols-outlined text-[16px] icon-fill">military_tech</span>
            {s.consecutive_years >= 50 ? "King" : "Aristocrat"}
          </span>
          <ScoreBadge analysis={analysis} />
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-stack-md mb-stack-md">
        <div className="bg-surface-container-low rounded-xl p-stack-md">
          <p className="text-label-md font-label-md text-on-surface-variant mb-stack-sm">
            연속 배당 성장
          </p>
          <p className="text-headline-md font-headline-md text-primary">{s.consecutive_years}년</p>
        </div>
        <div className="bg-surface-container-low rounded-xl p-stack-md">
          <p className="text-label-md font-label-md text-on-surface-variant mb-stack-sm">배당 수익률</p>
          <p className="text-headline-md font-headline-md text-secondary">{s.dividend_yield}%</p>
        </div>
      </div>

      <p className="relative z-10 text-body-md font-body-md text-on-surface-variant mb-stack-md">
        {s.business_summary}
      </p>

      {analysis && analysis.status !== "failed" && (
        <div className="relative z-10 mb-stack-md flex flex-col gap-stack-sm">
          <FlagChips analysis={analysis} />
          <NewsChips news={analysis.news} />
          <ScoreNarrative analysis={analysis} />
          {/* 점수만 보여주면 판단 근거가 안 보인다. 원지표를 항상 같이 노출한다(로드맵 81~84줄). */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-label-md font-label-md text-on-surface-variant">
            <AxisScores analysis={analysis} />
            {analysis.metrics?.payout_ocf != null && (
              <span>
                배당성향 {analysis.metrics.payout_ocf}%
                {analysis.metrics.payout_band && ` (경고선 ${analysis.metrics.payout_band.warn}%)`}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="relative z-10 mt-auto border-t border-surface-variant pt-stack-md flex items-center gap-base text-label-md font-label-md text-on-surface-variant">
        <span className="material-symbols-outlined text-[18px]">calendar_month</span>
        지급월 {s.payout_months.join("·")}월
      </div>
    </div>
  );
}

export default function StocksPage() {
  const [stocks, setStocks] = useState<Stock[] | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, TickerAnalysis>>({});
  const [analysisAsOf, setAnalysisAsOf] = useState<string | null>(null);
  const [sortByScore, setSortByScore] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("dividend_stocks")
        .select("*")
        .order("consecutive_years", { ascending: false });
      setStocks(data ?? []);
    }
    load();
  }, []);

  useEffect(() => {
    fetchLatestAnalysis()
      .then(({ asOf, byTicker }) => {
        setAnalysisAsOf(asOf);
        setAnalysis(byTicker);
      })
      .catch(() => {});
  }, []);

  // 손입력 DB 값 대신 배치가 야후 배당 이력으로 계산해둔 수익률을 쓴다.
  // 예전엔 진입할 때마다 야후에 86건을 던졌는데, 이제 위 한 번의 조회로 끝난다.
  // 배치가 계산 못 한 종목은 카탈로그의 DB 값이 그대로 폴백으로 남는다.
  const displayStocks = useMemo(
    () =>
      stocks?.map((s) => ({
        ...s,
        dividend_yield: analysis[s.ticker]?.dividend_yield ?? s.dividend_yield,
      })),
    [stocks, analysis]
  );

  const sectorCounts = useMemo(() => {
    if (!displayStocks) return [];
    const counts = new Map<string, number>();
    for (const s of displayStocks) counts.set(s.sector, (counts.get(s.sector) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [displayStocks]);

  const filteredStocks = useMemo(() => {
    const filtered = displayStocks?.filter((s) => !selectedSector || s.sector === selectedSector);
    if (!sortByScore || !filtered) return filtered;
    // 미분석 종목은 점수 정렬에서 맨 뒤로 보낸다. 0점 취급하면 "가장 위험한 종목"으로 올라온다.
    const score = (t: string) =>
      analysis[t]?.status === "failed" ? -1 : (analysis[t]?.total_score ?? -1);
    return [...filtered].sort((a, b) => score(a.ticker) - score(b.ticker));
  }, [displayStocks, selectedSector, sortByScore, analysis]);

  // 기본 정렬에서는 dividend_stocks 쿼리가 이미 consecutive_years desc라 첫 번째가 최고 연속성장
  // 종목이다. 점수 정렬로 바꾸면 "가장 낮은 점수"가 맨 앞이라 크게 띄우면 오히려 오해를 부른다.
  const featured = sortByScore ? undefined : filteredStocks?.[0];
  const restStocks = sortByScore ? (filteredStocks ?? []) : (filteredStocks ?? []).slice(1);

  return (
    <main className="w-full max-w-[1200px] mx-auto px-container-margin py-section-gap pb-[100px] md:pb-section-gap">
      <div className="flex flex-col gap-stack-md mb-stack-lg">
        <h2 className="text-headline-lg font-headline-lg md:text-display-lg md:font-display-lg text-primary tracking-tight">
          배당킹 · 배당귀족
        </h2>
        <p className="text-body-lg font-body-lg text-on-surface-variant max-w-2xl">
          이 서비스가 플랜을 짤 때 사용하는 큐레이션된 배당킹·배당귀족 종목들이에요. 섹터를 눌러서
          필터링해보세요.
        </p>
      </div>

      <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-stack-md">
        <AsOfNotice asOf={analysisAsOf} />
        <button
          type="button"
          onClick={() => setSortByScore((v) => !v)}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-label-md font-label-md transition-colors ${
            sortByScore
              ? "bg-primary text-on-primary"
              : "bg-surface-container-low text-on-surface-variant border border-outline-variant hover:bg-surface-container-high"
          }`}
        >
          <span className="material-symbols-outlined mr-1 align-middle text-[16px]">sort</span>
          종합 점수 낮은 순
        </button>
      </div>

      {/* 카드마다 4축 점수를 찍으면서 기준을 안 보여주면 사용자가 그 숫자를 검증할 수 없다. */}
      <div className="mb-stack-lg">
        <ScoreCriteria />
      </div>

      <div className="flex overflow-x-auto gap-base py-2 mb-stack-lg border-b border-surface-variant">
        <button
          type="button"
          onClick={() => setSelectedSector(null)}
          className={`whitespace-nowrap px-4 py-2 rounded-full text-label-md font-label-md transition-colors ${
            selectedSector === null
              ? "bg-primary text-on-primary"
              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high border border-outline-variant"
          }`}
        >
          전체{" "}
          <span className="ml-1 font-normal text-outline">({stocks?.length ?? 0})</span>
        </button>
        {sectorCounts.map(([sector, count]) => (
          <button
            key={sector}
            type="button"
            onClick={() => setSelectedSector(sector)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-label-md font-label-md transition-colors ${
              selectedSector === sector
                ? "bg-primary text-on-primary"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high border border-outline-variant"
            }`}
          >
            {SECTOR_LABEL[sector] ?? sector}{" "}
            <span className="ml-1 font-normal text-outline">({count})</span>
          </button>
        ))}
      </div>

      {stocks === null && (
        <p className="text-body-md font-body-md text-on-surface-variant">불러오는 중...</p>
      )}

      {featured && (
        <div className="mb-stack-lg">
          <StockCard s={featured} analysis={analysis[featured.ticker]} featured />
        </div>
      )}

      <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-gutter">
        {restStocks.map((s) => (
          <StockCard key={s.ticker} s={s} analysis={analysis[s.ticker]} />
        ))}
      </div>
    </main>
  );
}
