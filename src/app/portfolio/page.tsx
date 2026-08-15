"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { aggregateHoldings, type HoldingTransaction } from "@/lib/holdings";
import { formatUsd } from "@/components/DividendChart";
import AllocationPie from "@/components/AllocationPie";
import HoldingsDividendCalendar from "@/components/HoldingsDividendCalendar";
import MonthlyDividendChart from "@/components/MonthlyDividendChart";
import PortfolioDividendSimulator from "@/components/PortfolioDividendSimulator";
import PortfolioDiagnosis from "@/components/PortfolioDiagnosis";
import { diagnosePortfolio } from "@/lib/portfolioDiagnosis";
import { Spiral } from "@/components/ui/spiral";
import { Select } from "@/components/ui/select";
import { AsOfNotice, FlagChips, NewsChips, ScoreBadge } from "@/components/ScoreBadge";
import { fetchLatestAnalysis, type TickerAnalysis } from "@/lib/tickerAnalysis";

type StoredTransaction = HoldingTransaction & { id: string };
type StoredReceipt = {
  id: string;
  ticker: string;
  name: string;
  amount: number;
  received_date: string;
};
type CatalogStock = {
  ticker: string;
  name: string;
  sector: string;
  dividend_yield: number;
  dividend_growth_5y: number;
  payout_months: number[];
};

const BROKERS = [
  "토스증권",
  "카카오페이증권",
  "미래에셋증권",
  "삼성증권",
  "한국투자증권",
  "NH투자증권",
  "KB증권",
  "신한투자증권",
  "키움증권",
  "하나증권",
  "대신증권",
  "메리츠증권",
  "유안타증권",
  "SK증권",
  "유진투자증권",
  "한화투자증권",
  "현대차증권",
  "신영증권",
  "IBK투자증권",
  "DB금융투자",
  "교보증권",
  "다올투자증권",
  "상상인증권",
  "부국증권",
  "기타",
];

const inputClass =
  "w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 text-body-md font-body-md transition-shadow focus:border-primary focus:ring-1 focus:ring-secondary focus:outline-none";
const labelClass =
  "mb-stack-sm block text-label-md font-label-md text-on-surface-variant";
const segmentClass =
  "rounded-xl border border-outline-variant bg-surface py-3 text-center text-body-md font-body-md transition-shadow focus:border-primary focus:ring-1 focus:ring-secondary focus:outline-none";

function onlyDigits(raw: string, maxLen: number) {
  return raw.replace(/\D/g, "").slice(0, maxLen);
}

/** 두 자리가 다 채워졌을 때만 범위를 강제한다 — 입력 중간(한 자리)엔 건드리지 않는다. */
function clampWhenComplete(
  digits: string,
  maxLen: number,
  min: number,
  max: number,
) {
  if (digits.length < maxLen) return digits;
  return String(Math.min(max, Math.max(min, Number(digits)))).padStart(
    maxLen,
    "0",
  );
}

/**
 * 네이티브 <input type="date">는 연도 4자 입력 후 월로 자동 이동하는 게 브라우저 내부
 * 세그먼트 로직이라 JS로 손댈 수 없다(포커스 위치조차 조회 불가). 연/월/일을 별도
 * 필드로 나눠서 자릿수 채워지면 직접 다음 필드로 focus를 옮긴다.
 */
function DateField({
  id,
  onChange,
  defaultValue,
}: {
  id: string;
  onChange: (isoDate: string) => void;
  defaultValue?: string;
}) {
  const [year, setYear] = useState(defaultValue?.slice(0, 4) ?? "");
  const [month, setMonth] = useState(defaultValue?.slice(5, 7) ?? "");
  const [day, setDay] = useState(defaultValue?.slice(8, 10) ?? "");
  const yearRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  function commit(y: string, m: string, d: string) {
    onChange(
      y.length === 4 && m !== "" && d !== ""
        ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
        : "",
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        id={id}
        ref={yearRef}
        inputMode="numeric"
        placeholder="YYYY"
        maxLength={4}
        className={`${segmentClass} w-20 px-2`}
        value={year}
        onChange={(e) => {
          const v = onlyDigits(e.target.value, 4);
          setYear(v);
          commit(v, month, day);
          if (v.length === 4) monthRef.current?.focus();
        }}
      />
      <span className="text-on-surface-variant">-</span>
      <input
        ref={monthRef}
        inputMode="numeric"
        placeholder="MM"
        maxLength={2}
        className={`${segmentClass} w-14 px-2`}
        value={month}
        onChange={(e) => {
          const v = clampWhenComplete(onlyDigits(e.target.value, 2), 2, 1, 12);
          setMonth(v);
          commit(year, v, day);
          if (v.length === 2) dayRef.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && month === "") yearRef.current?.focus();
        }}
      />
      <span className="text-on-surface-variant">-</span>
      <input
        ref={dayRef}
        inputMode="numeric"
        placeholder="DD"
        maxLength={2}
        className={`${segmentClass} w-14 px-2`}
        value={day}
        onChange={(e) => {
          const v = clampWhenComplete(onlyDigits(e.target.value, 2), 2, 1, 31);
          setDay(v);
          commit(year, month, v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && day === "") monthRef.current?.focus();
        }}
      />
    </div>
  );
}

const TABS = ["보유 현황", "진단", "배당지급월", "거래 내역", "배당 기록", "배당 시뮬레이션"] as const;
type PortfolioTab = (typeof TABS)[number];

type DatePreset = "all" | "today" | "1w" | "3m" | "6m" | "custom";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "today", label: "오늘" },
  { value: "1w", label: "1주" },
  { value: "3m", label: "3개월" },
  { value: "6m", label: "6개월" },
  { value: "custom", label: "기간 직접 입력" },
];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** 프리셋을 [시작일, 종료일] ISO 문자열 범위로 바꾼다. "전체"는 둘 다 null(제한 없음). */
function dateRangeFor(
  preset: DatePreset,
  customStart: string,
  customEnd: string,
): { start: string | null; end: string | null } {
  if (preset === "all") return { start: null, end: null };
  if (preset === "custom") return { start: customStart || null, end: customEnd || null };
  const today = new Date();
  const todayStr = isoDate(today);
  if (preset === "today") return { start: todayStr, end: todayStr };
  const daysAgo = preset === "1w" ? 7 : preset === "3m" ? 90 : 180;
  const past = new Date(today);
  past.setDate(past.getDate() - daysAgo);
  return { start: isoDate(past), end: todayStr };
}

/** 검색창(종목명/티커)·날짜 프리셋 필터 바. 거래 내역·배당 기록 탭이 공유한다. */
function RecordFilterBar({
  search,
  onSearchChange,
  datePreset,
  onDatePresetChange,
  customStart,
  onCustomStartChange,
  customEnd,
  onCustomEndChange,
  extraFilters,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  datePreset: DatePreset;
  onDatePresetChange: (v: DatePreset) => void;
  customStart: string;
  onCustomStartChange: (v: string) => void;
  customEnd: string;
  onCustomEndChange: (v: string) => void;
  extraFilters?: ReactNode;
}) {
  return (
    <div className="mb-stack-lg flex flex-col gap-stack-md">
      <div className="flex flex-wrap items-center gap-stack-md">
        <div className="relative w-full max-w-xs">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
            search
          </span>
          <input
            className={`${inputClass} pl-9`}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="종목명/티커 검색"
          />
        </div>
        {extraFilters}
      </div>
      <div className="flex flex-wrap gap-stack-sm">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onDatePresetChange(p.value)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-label-md font-label-md transition-colors ${
              datePreset === p.value
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface hover:bg-surface-container-high"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {datePreset === "custom" && (
        <div className="flex flex-wrap items-center gap-stack-md">
          <DateField id="filter-start" onChange={onCustomStartChange} defaultValue={customStart} />
          <span className="text-on-surface-variant">~</span>
          <DateField id="filter-end" onChange={onCustomEndChange} defaultValue={customEnd} />
        </div>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [transactions, setTransactions] = useState<StoredTransaction[] | null>(
    null,
  );
  const [catalog, setCatalog] = useState<CatalogStock[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [tab, setTab] = useState<PortfolioTab>("보유 현황");
  const [analysis, setAnalysis] = useState<Record<string, TickerAnalysis>>({});
  const [analysisAsOf, setAnalysisAsOf] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState<"buy" | "sell">("buy");
  const [tradeDate, setTradeDate] = useState("");
  const [dateFieldKey, setDateFieldKey] = useState(0);
  const [broker, setBroker] = useState("");

  const [receipts, setReceipts] = useState<StoredReceipt[] | null>(null);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [receiptTicker, setReceiptTicker] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [receiptDateFieldKey, setReceiptDateFieldKey] = useState(0);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [savingReceipt, setSavingReceipt] = useState(false);

  const [txnSearch, setTxnSearch] = useState("");
  const [txnDatePreset, setTxnDatePreset] = useState<DatePreset>("all");
  const [txnCustomStart, setTxnCustomStart] = useState("");
  const [txnCustomEnd, setTxnCustomEnd] = useState("");
  const [txnTypeFilter, setTxnTypeFilter] = useState<"all" | "buy" | "sell">("all");
  const [txnBrokerFilter, setTxnBrokerFilter] = useState("");

  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptDatePreset, setReceiptDatePreset] = useState<DatePreset>("all");
  const [receiptCustomStart, setReceiptCustomStart] = useState("");
  const [receiptCustomEnd, setReceiptCustomEnd] = useState("");

  useEffect(() => {
    fetchLatestAnalysis()
      .then(({ asOf, byTicker }) => {
        setAnalysisAsOf(asOf);
        setAnalysis(byTicker);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadTransactions = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("holding_transactions")
      .select("*")
      .eq("user_id", session.user.id)
      .order("trade_date", { ascending: false });
    setTransactions(data ?? []);
  }, [session]);

  const loadReceipts = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("dividend_receipts")
      .select("*")
      .eq("user_id", session.user.id)
      .order("received_date", { ascending: false });
    setReceipts(data ?? []);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("dividend_stocks")
      .select("ticker, name, sector, dividend_yield, dividend_growth_5y, payout_months")
      .then(({ data }) => setCatalog(data ?? []));
    loadTransactions();
    loadReceipts();
  }, [session, loadTransactions, loadReceipts]);

  // 손입력 DB 값 대신 배치가 계산해둔 수익률로 배당 캘린더를 만든다.
  // 예전엔 이 화면에 들어올 때마다 야후에 86건을 던졌다.
  const liveYields = useMemo(() => {
    const yields: Record<string, number> = {};
    for (const [ticker, row] of Object.entries(analysis)) {
      if (row.dividend_yield != null) yields[ticker] = row.dividend_yield;
    }
    return yields;
  }, [analysis]);

  const holdings = useMemo(
    () => (transactions ? aggregateHoldings(transactions) : []),
    [transactions],
  );

  const txnBrokerOptions = useMemo(() => {
    const set = new Set(
      (transactions ?? []).map((t) => t.broker).filter((b): b is string => !!b),
    );
    return Array.from(set).sort();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    const { start, end } = dateRangeFor(txnDatePreset, txnCustomStart, txnCustomEnd);
    const q = txnSearch.trim().toLowerCase();
    return transactions.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q) && !t.ticker.toLowerCase().includes(q))
        return false;
      if (start && t.trade_date < start) return false;
      if (end && t.trade_date > end) return false;
      if (txnTypeFilter !== "all" && t.type !== txnTypeFilter) return false;
      if (txnBrokerFilter && t.broker !== txnBrokerFilter) return false;
      return true;
    });
  }, [transactions, txnSearch, txnDatePreset, txnCustomStart, txnCustomEnd, txnTypeFilter, txnBrokerFilter]);

  const filteredReceipts = useMemo(() => {
    if (!receipts) return [];
    const { start, end } = dateRangeFor(receiptDatePreset, receiptCustomStart, receiptCustomEnd);
    const q = receiptSearch.trim().toLowerCase();
    return receipts.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.ticker.toLowerCase().includes(q))
        return false;
      if (start && r.received_date < start) return false;
      if (end && r.received_date > end) return false;
      return true;
    });
  }, [receipts, receiptSearch, receiptDatePreset, receiptCustomStart, receiptCustomEnd]);

  useEffect(() => {
    if (holdings.length === 0) return;
    const tickers = holdings.map((h) => h.ticker).join(",");
    let cancelled = false;
    fetch(`/api/portfolio/prices?tickers=${encodeURIComponent(tickers)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPrices(d.prices ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [holdings]);

  const catalogByTicker = useMemo(
    () =>
      new Map(
        catalog.map((c) => [
          c.ticker.toUpperCase(),
          { ...c, dividend_yield: liveYields[c.ticker] ?? c.dividend_yield },
        ]),
      ),
    [catalog, liveYields],
  );

  function handleTickerChange(value: string) {
    setTicker(value);
    const match = catalogByTicker.get(value.toUpperCase());
    if (match) setName(match.name);
  }

  const rows = holdings.map((h) => {
    const currentPrice = prices[h.ticker] ?? null;
    const marketValue = currentPrice != null ? h.quantity * currentPrice : null;
    const costBasis = h.quantity * h.avgPrice;
    const gain = marketValue != null ? marketValue - costBasis : null;
    const gainPct =
      gain != null && costBasis > 0 ? (gain / costBasis) * 100 : null;
    return { ...h, currentPrice, marketValue, costBasis, gain, gainPct };
  });
  const totalMarketValue = rows.reduce(
    (sum, r) => sum + (r.marketValue ?? r.costBasis),
    0,
  );
  const totalCostBasis = rows.reduce((sum, r) => sum + r.costBasis, 0);
  const totalGain = totalMarketValue - totalCostBasis;
  const totalGainPct = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : null;

  const allocationsForPie =
    totalMarketValue > 0
      ? rows.map((r) => ({
          ticker: r.ticker,
          weight_pct: ((r.marketValue ?? r.costBasis) / totalMarketValue) * 100,
        }))
      : [];

  const holdingsForCalendar = rows.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    marketValue: r.marketValue ?? r.costBasis,
  }));

  const diagnosis = diagnosePortfolio({
    holdings: holdingsForCalendar,
    analysis,
    catalog: Object.fromEntries(catalogByTicker),
    receipts: receipts ?? [],
    now: new Date(),
  });

  const allFilled = [ticker, name, quantity, price, tradeDate].every(
    (v) => v !== "",
  );
  const quantityNum = Number(quantity);
  const priceNum = Number(price);
  const inputError = !allFilled
    ? null
    : !Number.isFinite(quantityNum) || quantityNum <= 0
      ? "수량은 0보다 커야 해요."
      : !Number.isFinite(priceNum) || priceNum < 0
        ? "가격을 확인해주세요."
        : null;

  function closeTransactionForm() {
    setTicker("");
    setName("");
    setQuantity("");
    setPrice("");
    setTradeDate("");
    setDateFieldKey((k) => k + 1);
    setBroker("");
    setEditingTransactionId(null);
    setShowAddForm(false);
  }

  function startEditTransaction(t: StoredTransaction) {
    setEditingTransactionId(t.id);
    setTicker(t.ticker);
    setName(t.name);
    setQuantity(String(t.quantity));
    setPrice(String(t.price));
    setType(t.type);
    setTradeDate(t.trade_date);
    setDateFieldKey((k) => k + 1);
    setBroker(t.broker ?? "");
    setShowAddForm(true);
  }

  async function handleSubmitTransaction() {
    if (!session || inputError || !allFilled) return;
    setSaving(true);
    setError(null);
    const payload = {
      user_id: session.user.id,
      ticker: ticker.toUpperCase(),
      name,
      type,
      quantity: quantityNum,
      price: priceNum,
      trade_date: tradeDate,
      broker: broker || null,
    };
    const { error: submitError } = editingTransactionId
      ? await supabase.from("holding_transactions").update(payload).eq("id", editingTransactionId)
      : await supabase.from("holding_transactions").insert(payload);
    setSaving(false);
    if (submitError) {
      setError(editingTransactionId ? "수정에 실패했어요." : "추가에 실패했어요.");
      return;
    }
    closeTransactionForm();
    loadTransactions();
  }

  async function handleDelete(
    table: "holding_transactions" | "dividend_receipts",
    id: string,
  ) {
    await supabase.from(table).delete().eq("id", id);
    setConfirmingDeleteId(null);
    if (table === "holding_transactions") loadTransactions();
    else loadReceipts();
  }

  const receiptAmountNum = Number(receiptAmount);
  const receiptFilled = receiptTicker !== "" && receiptAmount !== "" && receiptDate !== "";
  const receiptInputError = !receiptFilled
    ? null
    : !Number.isFinite(receiptAmountNum) || receiptAmountNum <= 0
      ? "배당금액은 0보다 커야 해요."
      : null;

  function closeReceiptForm() {
    setReceiptTicker("");
    setReceiptAmount("");
    setReceiptDate("");
    setReceiptDateFieldKey((k) => k + 1);
    setEditingReceiptId(null);
    setShowReceiptForm(false);
  }

  function startEditReceipt(r: StoredReceipt) {
    setEditingReceiptId(r.id);
    setReceiptTicker(r.ticker);
    setReceiptAmount(String(r.amount));
    setReceiptDate(r.received_date);
    setReceiptDateFieldKey((k) => k + 1);
    setShowReceiptForm(true);
  }

  async function handleSubmitReceipt() {
    if (!session || receiptInputError || !receiptFilled) return;
    const holding = holdings.find((h) => h.ticker === receiptTicker);
    setSavingReceipt(true);
    setReceiptError(null);
    const payload = {
      user_id: session.user.id,
      ticker: receiptTicker,
      name: holding?.name ?? receiptTicker,
      amount: receiptAmountNum,
      received_date: receiptDate,
    };
    const { error: submitError } = editingReceiptId
      ? await supabase.from("dividend_receipts").update(payload).eq("id", editingReceiptId)
      : await supabase.from("dividend_receipts").insert(payload);
    setSavingReceipt(false);
    if (submitError) {
      setReceiptError(editingReceiptId ? "수정에 실패했어요." : "추가에 실패했어요.");
      return;
    }
    closeReceiptForm();
    loadReceipts();
  }

  if (session === undefined) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-container-margin py-section-gap">
        <Spiral className="mx-auto size-8" />
      </main>
    );
  }

  if (session === null) {
    return (
      <main className="mx-auto flex w-full max-w-[1200px] flex-col items-center gap-stack-md px-container-margin py-section-gap text-center">
        <h2 className="text-headline-lg font-headline-lg text-primary">
          로그인이 필요해요
        </h2>
        <p className="text-body-md font-body-md text-on-surface-variant">
          내 포트폴리오는 실제 자산 정보라 로그인한 계정에만 저장돼요.
        </p>
        <Link
          href="/login"
          className="rounded-xl bg-primary px-6 py-3 text-body-md font-body-md font-bold text-on-primary transition-opacity hover:opacity-90"
        >
          로그인하기
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-container-margin py-section-gap pb-[100px] md:pb-section-gap">
      <div className="mb-stack-lg flex items-center justify-between">
        <h2 className="text-headline-lg font-headline-lg text-primary">
          내 포트폴리오
        </h2>
        <button
          type="button"
          onClick={() => (showAddForm ? closeTransactionForm() : setShowAddForm(true))}
          className="rounded-xl bg-primary px-6 py-3 text-body-md font-body-md font-bold text-on-primary transition-opacity hover:opacity-90"
        >
          {showAddForm ? "닫기" : "거래 추가하기"}
        </button>
      </div>

      {showAddForm && (
      <section className="mb-section-gap rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
        <h3 className="mb-stack-lg text-headline-md font-headline-md text-primary">
          {editingTransactionId ? "거래 수정하기" : "거래 추가하기"}
        </h3>
        <div className="mb-stack-lg grid grid-cols-1 gap-stack-md sm:grid-cols-2 md:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="ticker">
              티커
            </label>
            <input
              id="ticker"
              list="ticker-catalog"
              className={inputClass}
              value={ticker}
              onChange={(e) => handleTickerChange(e.target.value)}
              placeholder="KO"
            />
            <datalist id="ticker-catalog">
              {catalog.map((c) => (
                <option key={c.ticker} value={c.ticker}>
                  {c.name}
                </option>
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelClass} htmlFor="name">
              종목명
            </label>
            <input
              id="name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Coca-Cola"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="type">
              구분
            </label>
            <Select
              id="type"
              value={type}
              onChange={(v) => setType(v as "buy" | "sell")}
              options={[
                { value: "buy", label: "매수" },
                { value: "sell", label: "매도" },
              ]}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="quantity">
              수량
            </label>
            <input
              id="quantity"
              type="number"
              min="0"
              step="any"
              className={inputClass}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="10"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="price">
              1주당 가격 ($)
            </label>
            <input
              id="price"
              type="number"
              min="0"
              step="any"
              className={inputClass}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="62.50"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="trade-date">
              거래일
            </label>
            <DateField
              key={dateFieldKey}
              id="trade-date"
              onChange={setTradeDate}
              defaultValue={tradeDate}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="broker">
              증권사 (선택)
            </label>
            <Select
              id="broker"
              value={broker}
              onChange={setBroker}
              placeholder="선택 안 함"
              options={[
                { value: "", label: "선택 안 함" },
                ...BROKERS.map((b) => ({ value: b, label: b })),
              ]}
            />
          </div>
        </div>

        {inputError && (
          <p className="mb-stack-md flex items-center gap-stack-sm text-label-md font-label-md text-error">
            <span className="material-symbols-outlined text-base">error</span>
            {inputError}
          </p>
        )}
        {error && (
          <p className="mb-stack-md flex items-center gap-stack-sm text-label-md font-label-md text-error">
            <span className="material-symbols-outlined text-base">error</span>
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!allFilled || !!inputError || saving}
          onClick={handleSubmitTransaction}
          className="w-full rounded-xl bg-primary py-3 text-body-md font-body-md font-bold text-on-primary transition-opacity hover:opacity-90 disabled:bg-surface-container-high disabled:text-outline sm:w-auto sm:px-8"
        >
          {saving ? <Spiral className="size-5" /> : editingTransactionId ? "수정하기" : "추가하기"}
        </button>
      </section>
      )}

      {transactions !== null && transactions.length === 0 && (
        <p className="mb-section-gap text-body-md font-body-md text-on-surface-variant">
          아직 등록된 거래가 없어요. 위에서 첫 거래를 추가해보세요.
        </p>
      )}

      {transactions !== null && transactions.length > 0 && (
        <>
          <div className="mb-stack-lg flex gap-stack-sm overflow-x-auto pb-stack-sm">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`whitespace-nowrap rounded-full px-6 py-2 text-label-md font-label-md transition-colors ${
                  tab === t
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "보유 현황" && rows.length > 0 && (
            <>
              <div className="mb-stack-lg grid grid-cols-1 gap-stack-md sm:grid-cols-3">
                <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
                  <p className="text-label-md font-label-md text-on-surface-variant">
                    총 투자금액
                  </p>
                  <p className="text-headline-md font-headline-md text-primary">
                    {formatUsd(totalCostBasis)}
                  </p>
                </div>
                <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
                  <p className="text-label-md font-label-md text-on-surface-variant">
                    총 평가금액
                  </p>
                  <p className="text-headline-md font-headline-md text-primary">
                    {formatUsd(totalMarketValue)}
                  </p>
                </div>
                <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
                  <p className="text-label-md font-label-md text-on-surface-variant">
                    총 평가손익
                  </p>
                  <p
                    className={`text-headline-md font-headline-md ${
                      totalGain >= 0 ? "text-secondary" : "text-error"
                    }`}
                  >
                    {totalGain >= 0 ? "+" : ""}
                    {formatUsd(totalGain)}
                    {totalGainPct != null && ` (${totalGainPct.toFixed(1)}%)`}
                  </p>
                </div>
              </div>

              <section className="mb-section-gap flex flex-col gap-stack-lg md:flex-row md:items-start">
              <div className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
                <h3 className="mb-stack-md text-headline-md font-headline-md text-primary">
                  비중
                </h3>
                <AllocationPie allocations={allocationsForPie} />
              </div>

              <div className="flex-1 overflow-x-auto rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
                <div className="mb-stack-md flex flex-wrap items-center justify-between gap-stack-sm">
                  <h3 className="text-headline-md font-headline-md text-primary">보유 종목</h3>
                  <AsOfNotice asOf={analysisAsOf} />
                </div>
                <table className="w-full min-w-[680px] border-collapse text-left text-body-md font-body-md">
                  <thead>
                    <tr className="text-label-md font-label-md text-on-surface-variant">
                      <th className="border-b border-outline-variant px-3 py-2">
                        종목
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2">
                        종합 점수
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2 text-right">
                        수량
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2 text-right">
                        평단가
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2 text-right">
                        현재가
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2 text-right">
                        평가금액
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2 text-right">
                        평가손익
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.ticker}>
                        <td className="border-b border-outline-variant px-3 py-2 font-bold text-primary">
                          {r.name}{" "}
                          <span className="font-normal text-on-surface-variant">
                            ({r.ticker})
                          </span>
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2">
                          <div className="flex flex-col items-start gap-1">
                            <ScoreBadge analysis={analysis[r.ticker]} />
                            <FlagChips analysis={analysis[r.ticker]} />
                            <NewsChips news={analysis[r.ticker]?.news} compact />
                          </div>
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2 text-right">
                          {r.quantity}
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2 text-right">
                          {formatUsd(r.avgPrice)}
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2 text-right">
                          {r.currentPrice != null
                            ? formatUsd(r.currentPrice)
                            : "—"}
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2 text-right">
                          {r.marketValue != null
                            ? formatUsd(r.marketValue)
                            : "—"}
                        </td>
                        <td
                          className={`border-b border-outline-variant px-3 py-2 text-right font-bold ${
                            r.gain == null
                              ? "text-on-surface-variant"
                              : r.gain >= 0
                                ? "text-secondary"
                                : "text-error"
                          }`}
                        >
                          {r.gain != null
                            ? `${r.gain >= 0 ? "+" : ""}${formatUsd(r.gain)} (${r.gainPct!.toFixed(1)}%)`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </section>
            </>
          )}

          {tab === "진단" && rows.length > 0 && (
            <section className="mb-section-gap rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
              <div className="mb-stack-md">
                <AsOfNotice asOf={analysisAsOf} />
              </div>
              <PortfolioDiagnosis diagnosis={diagnosis} analysis={analysis} />
            </section>
          )}

          {tab === "배당지급월" && holdingsForCalendar.length > 0 && (
            <section className="mb-section-gap rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
              <HoldingsDividendCalendar
                holdings={holdingsForCalendar}
                catalog={Object.fromEntries(catalogByTicker)}
                receipts={receipts ?? []}
              />
            </section>
          )}

          {tab === "거래 내역" && (
            <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
              <h3 className="mb-stack-md text-headline-md font-headline-md text-primary">
                거래 내역
              </h3>
              <RecordFilterBar
                search={txnSearch}
                onSearchChange={setTxnSearch}
                datePreset={txnDatePreset}
                onDatePresetChange={setTxnDatePreset}
                customStart={txnCustomStart}
                onCustomStartChange={setTxnCustomStart}
                customEnd={txnCustomEnd}
                onCustomEndChange={setTxnCustomEnd}
                extraFilters={
                  <>
                    <div className="w-40">
                      <Select
                        id="txn-type-filter"
                        value={txnTypeFilter}
                        onChange={(v) => setTxnTypeFilter(v as "all" | "buy" | "sell")}
                        options={[
                          { value: "all", label: "구분 전체" },
                          { value: "buy", label: "매수" },
                          { value: "sell", label: "매도" },
                        ]}
                      />
                    </div>
                    <div className="w-44">
                      <Select
                        id="txn-broker-filter"
                        value={txnBrokerFilter}
                        onChange={setTxnBrokerFilter}
                        placeholder="증권사 전체"
                        options={[
                          { value: "", label: "증권사 전체" },
                          ...txnBrokerOptions.map((b) => ({ value: b, label: b })),
                        ]}
                      />
                    </div>
                  </>
                }
              />
              {filteredTransactions.length === 0 && (
                <p className="text-body-md font-body-md text-on-surface-variant">
                  조건에 맞는 거래가 없어요.
                </p>
              )}
              {filteredTransactions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-body-md font-body-md">
                  <thead>
                    <tr className="text-label-md font-label-md text-on-surface-variant">
                      <th className="border-b border-outline-variant px-3 py-2">
                        날짜
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2">
                        종목
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2">
                        구분
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2 text-right">
                        수량
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2 text-right">
                        가격
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2">
                        증권사
                      </th>
                      <th className="border-b border-outline-variant px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((t) => (
                      <tr key={t.id}>
                        <td className="border-b border-outline-variant px-3 py-2">
                          {t.trade_date}
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2">
                          {t.name}{" "}
                          <span className="text-on-surface-variant">
                            ({t.ticker})
                          </span>
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2">
                          {t.type === "buy" ? "매수" : "매도"}
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2 text-right">
                          {t.quantity}
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2 text-right">
                          {formatUsd(t.price)}
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2 text-on-surface-variant">
                          {t.broker || "—"}
                        </td>
                        <td className="border-b border-outline-variant px-3 py-2 text-right">
                          {confirmingDeleteId === t.id ? (
                            <div className="flex items-center justify-end gap-stack-md whitespace-nowrap">
                              <span className="text-label-md font-label-md text-error">
                                삭제할까요?
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDelete("holding_transactions", t.id)}
                                className="text-label-md font-label-md font-bold text-error hover:underline"
                              >
                                삭제
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(null)}
                                className="text-label-md font-label-md text-on-surface-variant hover:underline"
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-stack-md">
                              <button
                                type="button"
                                onClick={() => startEditTransaction(t)}
                                className="text-on-surface-variant transition-colors hover:text-primary"
                                aria-label="수정"
                                title="수정"
                              >
                                <span className="material-symbols-outlined text-base">
                                  edit
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(t.id)}
                                className="text-on-surface-variant transition-colors hover:text-error"
                                aria-label="삭제"
                                title="삭제"
                              >
                                <span className="material-symbols-outlined text-base">
                                  delete
                                </span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </section>
          )}

          {tab === "배당 기록" && (
            <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
              <h3 className="mb-stack-lg text-headline-md font-headline-md text-primary">
                배당 기록
              </h3>

              {holdings.length === 0 && (
                <p className="text-body-md font-body-md text-on-surface-variant">
                  보유 종목이 있어야 배당을 기록할 수 있어요.
                </p>
              )}

              {receipts !== null && receipts.length > 0 && (
                <div className="mb-section-gap">
                  <MonthlyDividendChart receipts={receipts} />
                </div>
              )}

              {holdings.length > 0 && (
                <RecordFilterBar
                  search={receiptSearch}
                  onSearchChange={setReceiptSearch}
                  datePreset={receiptDatePreset}
                  onDatePresetChange={setReceiptDatePreset}
                  customStart={receiptCustomStart}
                  onCustomStartChange={setReceiptCustomStart}
                  customEnd={receiptCustomEnd}
                  onCustomEndChange={setReceiptCustomEnd}
                  extraFilters={
                    <button
                      type="button"
                      onClick={() => (showReceiptForm ? closeReceiptForm() : setShowReceiptForm(true))}
                      className="rounded-xl bg-primary px-6 py-3 text-body-md font-body-md font-bold text-on-primary transition-opacity hover:opacity-90"
                    >
                      {showReceiptForm ? "닫기" : "배당 기록 추가"}
                    </button>
                  }
                />
              )}

              {showReceiptForm && (
                <div className="mb-stack-lg grid grid-cols-1 gap-stack-md rounded-xl border border-outline-variant p-6 sm:grid-cols-3">
                  <p className="col-span-full text-label-md font-bold text-on-surface">
                    {editingReceiptId ? "배당 기록 수정" : "배당 기록 추가"}
                  </p>
                  <div>
                    <label className={labelClass} htmlFor="receipt-ticker">
                      종목
                    </label>
                    <Select
                      id="receipt-ticker"
                      value={receiptTicker}
                      onChange={setReceiptTicker}
                      placeholder="종목 선택"
                      options={holdings.map((h) => ({
                        value: h.ticker,
                        label: `${h.name} (${h.ticker})`,
                      }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="receipt-amount">
                      배당금액 ($)
                    </label>
                    <input
                      id="receipt-amount"
                      type="number"
                      min="0"
                      step="any"
                      className={inputClass}
                      value={receiptAmount}
                      onChange={(e) => setReceiptAmount(e.target.value)}
                      placeholder="12.34"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="receipt-date">
                      배당 지급일
                    </label>
                    <DateField
                      key={receiptDateFieldKey}
                      id="receipt-date"
                      onChange={setReceiptDate}
                      defaultValue={receiptDate}
                    />
                  </div>

                  {receiptInputError && (
                    <p className="col-span-full flex items-center gap-stack-sm text-label-md font-label-md text-error">
                      <span className="material-symbols-outlined text-base">error</span>
                      {receiptInputError}
                    </p>
                  )}
                  {receiptError && (
                    <p className="col-span-full flex items-center gap-stack-sm text-label-md font-label-md text-error">
                      <span className="material-symbols-outlined text-base">error</span>
                      {receiptError}
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={!receiptFilled || !!receiptInputError || savingReceipt}
                    onClick={handleSubmitReceipt}
                    className="rounded-xl bg-primary py-3 text-body-md font-body-md font-bold text-on-primary transition-opacity hover:opacity-90 disabled:bg-surface-container-high disabled:text-outline sm:w-auto sm:px-8"
                  >
                    {savingReceipt ? <Spiral className="size-5" /> : editingReceiptId ? "수정하기" : "추가하기"}
                  </button>
                </div>
              )}

              {receipts !== null && receipts.length === 0 && (
                <p className="text-body-md font-body-md text-on-surface-variant">
                  아직 기록된 배당이 없어요.
                </p>
              )}

              {receipts !== null && receipts.length > 0 && filteredReceipts.length === 0 && (
                <p className="text-body-md font-body-md text-on-surface-variant">
                  조건에 맞는 배당 기록이 없어요.
                </p>
              )}

              {filteredReceipts.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-left text-body-md font-body-md">
                    <thead>
                      <tr className="text-label-md font-label-md text-on-surface-variant">
                        <th className="border-b border-outline-variant px-3 py-2">
                          날짜
                        </th>
                        <th className="border-b border-outline-variant px-3 py-2">
                          종목
                        </th>
                        <th className="border-b border-outline-variant px-3 py-2 text-right">
                          배당금액
                        </th>
                        <th className="border-b border-outline-variant px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReceipts.map((r) => (
                        <tr key={r.id}>
                          <td className="border-b border-outline-variant px-3 py-2">
                            {r.received_date}
                          </td>
                          <td className="border-b border-outline-variant px-3 py-2">
                            {r.name}{" "}
                            <span className="text-on-surface-variant">
                              ({r.ticker})
                            </span>
                          </td>
                          <td className="border-b border-outline-variant px-3 py-2 text-right font-bold text-secondary">
                            {formatUsd(r.amount)}
                          </td>
                          <td className="border-b border-outline-variant px-3 py-2 text-right">
                            {confirmingDeleteId === r.id ? (
                              <div className="flex items-center justify-end gap-stack-md whitespace-nowrap">
                                <span className="text-label-md font-label-md text-error">
                                  삭제할까요?
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDelete("dividend_receipts", r.id)}
                                  className="text-label-md font-label-md font-bold text-error hover:underline"
                                >
                                  삭제
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingDeleteId(null)}
                                  className="text-label-md font-label-md text-on-surface-variant hover:underline"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-stack-md">
                                <button
                                  type="button"
                                  onClick={() => startEditReceipt(r)}
                                  className="text-on-surface-variant transition-colors hover:text-primary"
                                  aria-label="수정"
                                  title="수정"
                                >
                                  <span className="material-symbols-outlined text-base">
                                    edit
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingDeleteId(r.id)}
                                  className="text-on-surface-variant transition-colors hover:text-error"
                                  aria-label="삭제"
                                  title="삭제"
                                >
                                  <span className="material-symbols-outlined text-base">
                                    delete
                                  </span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {tab === "배당 시뮬레이션" && (
            <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
              <h3 className="mb-stack-lg text-headline-md font-headline-md text-primary">
                배당 시뮬레이션
              </h3>
              <PortfolioDividendSimulator
                holdings={rows.map((r) => ({ ticker: r.ticker, marketValue: r.marketValue ?? r.costBasis }))}
                allocations={allocationsForPie}
                catalog={Object.fromEntries(catalogByTicker)}
                receipts={receipts ?? []}
              />
            </section>
          )}
        </>
      )}
    </main>
  );
}
