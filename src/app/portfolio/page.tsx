"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { aggregateHoldings, type HoldingTransaction } from "@/lib/holdings";
import { formatUsd } from "@/components/DividendChart";
import AllocationPie from "@/components/AllocationPie";
import DividendCalendar from "@/components/DividendCalendar";
import { Spiral } from "@/components/ui/spiral";

type StoredTransaction = HoldingTransaction & { id: string };
type CatalogStock = {
  ticker: string;
  name: string;
  dividend_yield: number;
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
}: {
  id: string;
  onChange: (isoDate: string) => void;
}) {
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
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

const TABS = ["보유 현황", "배당지급월", "거래 내역"] as const;
type PortfolioTab = (typeof TABS)[number];

type SelectOption = { value: string; label: string };

/** 네이티브 select는 팝업 모양을 CSS로 못 바꿔서, 트리거+목록을 직접 그리는 커스텀 드롭다운. */
function Select({
  id,
  value,
  onChange,
  options,
  placeholder = "선택",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-full border border-outline-variant bg-surface px-4 py-2.5 text-body-md font-body-md transition-shadow focus:border-primary focus:ring-1 focus:ring-secondary focus:outline-none"
      >
        <span className={selected ? "" : "text-on-surface-variant"}>
          {selected?.label ?? placeholder}
        </span>
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
          expand_more
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-2 max-h-64 w-full min-w-max overflow-y-auto rounded-2xl border border-outline-variant bg-surface-container-lowest p-1 shadow-[0_4px_12px_rgba(0,8,31,0.15)]"
        >
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-body-md font-body-md transition-colors hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined w-4 shrink-0 text-[16px] text-primary">
                  {o.value === value ? "check" : ""}
                </span>
                <span
                  className={o.value === value ? "font-bold text-primary" : ""}
                >
                  {o.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
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
  const [liveYields, setLiveYields] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const [tab, setTab] = useState<PortfolioTab>("보유 현황");

  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState<"buy" | "sell">("buy");
  const [tradeDate, setTradeDate] = useState("");
  const [dateFieldKey, setDateFieldKey] = useState(0);
  const [broker, setBroker] = useState("");

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

  useEffect(() => {
    if (!session) return;
    supabase
      .from("dividend_stocks")
      .select("ticker, name, dividend_yield, payout_months")
      .then(({ data }) => setCatalog(data ?? []));
    supabase
      .from("holding_transactions")
      .select("*")
      .eq("user_id", session.user.id)
      .order("trade_date", { ascending: false })
      .then(({ data }) => setTransactions(data ?? []));
  }, [session]);

  // 손입력 DB 값 대신 야후 배당 이력 기반 실시간 수익률로 배당 캘린더를 계산한다.
  useEffect(() => {
    if (catalog.length === 0) return;
    const tickers = catalog.map((c) => c.ticker).join(",");
    fetch(`/api/stocks/rates?tickers=${encodeURIComponent(tickers)}`)
      .then((r) => r.json())
      .then((d) => {
        const rates: Record<string, { dividend_yield: number | null }> =
          d.rates ?? {};
        const yields: Record<string, number> = {};
        for (const [ticker, rate] of Object.entries(rates)) {
          if (rate.dividend_yield != null) yields[ticker] = rate.dividend_yield;
        }
        setLiveYields(yields);
      })
      .catch(() => {});
  }, [catalog]);

  const holdings = useMemo(
    () => (transactions ? aggregateHoldings(transactions) : []),
    [transactions],
  );

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

  const allocationsForPie =
    totalMarketValue > 0
      ? rows.map((r) => ({
          ticker: r.ticker,
          weight_pct: ((r.marketValue ?? r.costBasis) / totalMarketValue) * 100,
        }))
      : [];

  const allocationsForCalendar = rows
    .map((r) => {
      const catalogStock = catalogByTicker.get(r.ticker.toUpperCase());
      if (!catalogStock || totalMarketValue === 0) return null;
      return {
        ticker: r.ticker,
        name: r.name,
        weight_pct: ((r.marketValue ?? r.costBasis) / totalMarketValue) * 100,
        dividend_yield: catalogStock.dividend_yield,
        payout_months: catalogStock.payout_months,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

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

  async function handleAddTransaction() {
    if (!session || inputError || !allFilled) return;
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase
      .from("holding_transactions")
      .insert({
        user_id: session.user.id,
        ticker: ticker.toUpperCase(),
        name,
        type,
        quantity: quantityNum,
        price: priceNum,
        trade_date: tradeDate,
        broker: broker || null,
      });
    setSaving(false);
    if (insertError) {
      setError("추가에 실패했어요.");
      return;
    }
    setTicker("");
    setName("");
    setQuantity("");
    setPrice("");
    setTradeDate("");
    setDateFieldKey((k) => k + 1);
    setBroker("");
    loadTransactions();
  }

  async function handleDelete(id: string) {
    await supabase.from("holding_transactions").delete().eq("id", id);
    setConfirmingDeleteId(null);
    loadTransactions();
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
      <h2 className="mb-stack-lg text-headline-lg font-headline-lg text-primary">
        내 포트폴리오
      </h2>

      <section className="mb-section-gap rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
        <h3 className="mb-stack-lg text-headline-md font-headline-md text-primary">
          거래 추가하기
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
          onClick={handleAddTransaction}
          className="w-full rounded-xl bg-primary py-3 text-body-md font-body-md font-bold text-on-primary transition-opacity hover:opacity-90 disabled:bg-surface-container-high disabled:text-outline sm:w-auto sm:px-8"
        >
          {saving ? <Spiral className="size-5" /> : "추가하기"}
        </button>
      </section>

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
            <section className="mb-section-gap flex flex-col gap-stack-lg md:flex-row md:items-start">
              <div className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
                <h3 className="mb-stack-md text-headline-md font-headline-md text-primary">
                  비중
                </h3>
                <AllocationPie allocations={allocationsForPie} />
              </div>

              <div className="flex-1 overflow-x-auto rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
                <h3 className="mb-stack-md text-headline-md font-headline-md text-primary">
                  보유 종목
                </h3>
                <table className="w-full min-w-[560px] border-collapse text-left text-body-md font-body-md">
                  <thead>
                    <tr className="text-label-md font-label-md text-on-surface-variant">
                      <th className="border-b border-outline-variant px-3 py-2">
                        종목
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
          )}

          {tab === "배당지급월" && allocationsForCalendar.length > 0 && (
            <section className="mb-section-gap rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
              <DividendCalendar
                allocations={allocationsForCalendar}
                monthlyInvestment={totalMarketValue}
              />
            </section>
          )}

          {tab === "거래 내역" && (
            <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
              <h3 className="mb-stack-md text-headline-md font-headline-md text-primary">
                거래 내역
              </h3>
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
                    {transactions.map((t) => (
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
                                onClick={() => handleDelete(t.id)}
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
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
