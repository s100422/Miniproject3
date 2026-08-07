"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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

export default function StocksPage() {
  const [stocks, setStocks] = useState<Stock[] | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

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

  const sectorCounts = useMemo(() => {
    if (!stocks) return [];
    const counts = new Map<string, number>();
    for (const s of stocks) counts.set(s.sector, (counts.get(s.sector) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [stocks]);

  const filteredStocks = stocks?.filter(
    (s) => !selectedSector || s.sector === selectedSector
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">배당킹·배당귀족</h1>
      <p className="mt-2 text-slate-600">
        이 서비스가 플랜을 짤 때 사용하는 큐레이션된 배당킹·배당귀족 종목들이에요.
        섹터를 눌러서 필터링해보세요.
      </p>

      {stocks === null && <p className="mt-6 text-slate-500">불러오는 중...</p>}

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setSelectedSector(null)}
          className={`rounded-lg border p-3 text-left text-sm ${
            selectedSector === null
              ? "border-emerald-600 bg-emerald-50"
              : "border-slate-200 hover:border-slate-400"
          }`}
        >
          <p className="font-medium text-slate-900">전체</p>
          <p className="text-slate-500">{stocks?.length ?? 0}종목</p>
        </button>
        {sectorCounts.map(([sector, count]) => (
          <button
            key={sector}
            type="button"
            onClick={() => setSelectedSector(sector)}
            className={`rounded-lg border p-3 text-left text-sm ${
              selectedSector === sector
                ? "border-emerald-600 bg-emerald-50"
                : "border-slate-200 hover:border-slate-400"
            }`}
          >
            <p className="font-medium text-slate-900">
              {sector} <span className="text-slate-400">({SECTOR_LABEL[sector] ?? sector})</span>
            </p>
            <p className="text-slate-500">{count}종목</p>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {filteredStocks?.map((s) => (
          <div key={s.ticker} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-baseline justify-between">
              <p className="font-medium text-slate-900">
                {s.name} <span className="text-slate-400">({s.ticker})</span>
              </p>
              <span className="text-sm text-slate-600">
                연속 {s.consecutive_years}년 · 수익률 {s.dividend_yield}%
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {s.sector} · {s.business_summary}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              배당 지급월: {s.payout_months.join("·")}월
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
