"use client";

import { formatUsd } from "./DividendChart";
import { ScoreCriteria, ScoreNarrative } from "./ScoreBadge";
import type { Action, Diagnosis, Tier } from "@/lib/portfolioDiagnosis";
import type { TickerAnalysis } from "@/lib/tickerAnalysis";

/**
 * 진단 탭. **모든 숫자는 `portfolioDiagnosis.ts`가 코드로 계산한 값이고 여기선 그리기만 한다**
 * (docs/ROADMAP.md Phase 3).
 */

// 막대 조각과 범례 칩이 **같은 색**이어야 어느 조각이 어느 줄인지 눈으로 잇는다.
// 그래서 색을 한 벌만 두고 둘이 나눠 쓴다(배지가 쓰는 컨테이너 색 그대로).
const TIER: Record<Tier, { label: string; color: string; note: string }> = {
  risk: {
    label: "위험",
    color: "bg-error-container text-on-error-container",
    note: "배당함정 또는 경계 등급 — 실제 삭감 사례로 검증된 신호예요.",
  },
  warn: {
    label: "경고",
    color: "bg-warning-container text-on-warning-container",
    note: "삭감 신호는 아니지만 재무·배당성향·성장에 지켜볼 지표가 있어요.",
  },
  ok: {
    label: "양호",
    color: "bg-secondary-container text-on-secondary-container",
    note: "네 축 모두 기준선 안이에요.",
  },
  unanalyzed: {
    label: "미분석",
    color: "bg-surface-container-highest text-on-surface-variant",
    note: "점수를 못 낸 종목이에요. 조용히 빼지 않고 몫을 그대로 남겨뒀어요.",
  },
};

const ORDER: Tier[] = ["risk", "warn", "ok", "unanalyzed"];

const ACTION_LABEL: Record<Action["kind"], string> = {
  reduce: "축소 검토",
  expand: "확대 검토",
  new: "신규 편입 검토",
};

/** HHI는 숫자만 보면 못 읽는다. 미국 반독점 당국이 쓰는 통상 구간을 그대로 쓴다. */
function hhiLabel(hhi: number): string {
  if (hhi >= 2500) return "집중";
  if (hhi >= 1500) return "보통";
  return "분산";
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
      <p className="text-label-md font-label-md text-on-surface-variant">{title}</p>
      <p className="mt-stack-sm text-body-md font-bold text-primary">{value}</p>
      <p className="mt-stack-sm text-label-md font-label-md text-on-surface-variant">{note}</p>
    </div>
  );
}

export default function PortfolioDiagnosis({
  diagnosis,
  analysis = {},
}: {
  diagnosis: Diagnosis;
  /** 액션 후보에 그 종목의 AI 해설을 같이 붙이려고 받는다. 없으면 숫자만 나온다. */
  analysis?: Record<string, TickerAnalysis>;
}) {
  const { byTier, annualDividend, weightedSafety, safetyCoverage, sectorHhi, topSector, emptyMonths, actions } =
    diagnosis;

  if (annualDividend <= 0) {
    return (
      <p className="text-body-md font-body-md text-on-surface-variant">
        배당 추정에 쓸 데이터가 아직 없어요. 보유 종목을 등록하면 진단이 나와요.
      </p>
    );
  }

  const visible = ORDER.filter((t) => byTier[t].share > 0);

  return (
    <div className="flex flex-col gap-stack-lg">
      <section>
        <h2 className="text-body-md font-bold text-primary">위험 배당 노출도</h2>
        <p className="mt-stack-sm text-label-md font-label-md text-on-surface-variant">
          종목 수가 아니라 <strong className="text-primary">배당 금액 기준</strong>이에요. 연 배당
          추정 {formatUsd(annualDividend)}(세후)가 어느 등급에서 나오는지 나눈 값이에요.
        </p>

        {/* 막대 안에는 글씨를 넣지 않는다 — 조각이 좁아지면 라벨이 겹쳐서 못 읽는다.
            수치는 아래 범례에서 한 줄씩 읽게 한다. */}
        <div className="mt-stack-md flex h-4 w-full overflow-hidden rounded-full bg-surface-container">
          {visible.map((t) => (
            <div key={t} className={TIER[t].color} style={{ width: `${byTier[t].share}%` }} />
          ))}
        </div>

        <ul className="mt-stack-md flex flex-col gap-stack-sm">
          {visible.map((t) => (
            <li key={t} className="flex flex-wrap items-baseline gap-2">
              <span className={`rounded-full px-2.5 py-1 text-label-md font-label-md font-bold ${TIER[t].color}`}>
                {TIER[t].label} {byTier[t].share}%
              </span>
              <span className="text-label-md font-label-md text-on-surface">
                {byTier[t].tickers.join(", ")}
              </span>
              <span className="text-label-md font-label-md text-on-surface-variant">
                {TIER[t].note}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-1 gap-stack-md sm:grid-cols-3">
        <Metric
          title="배당가중 안전성"
          value={weightedSafety != null ? `${weightedSafety}점` : "—"}
          note={
            // 그냥 평균이 아니라 배당가중이라는 게 이 지표의 전부다. 단순평균은 배당을 거의 안
            // 주는 종목과 내 배당의 절반을 대는 종목을 똑같이 세서, 실제 위험을 흐린다.
            `종목별 안전성 점수를 배당 금액 비중으로 평균한 값이에요. 배당을 많이 주는 종목의 점수가 그만큼 크게 반영돼요. ${
              safetyCoverage >= 100
                ? "보유 배당 전체가 반영됐어요."
                : `지금은 내 배당의 ${safetyCoverage}%만 반영됐고, 나머지는 미분석 종목이에요.`
            }`
          }
        />
        <Metric
          title="섹터 집중도"
          value={`${sectorHhi} (${hhiLabel(sectorHhi)})`}
          note={
            topSector
              ? `평가금액 기준이에요. ${topSector.sector}가 ${topSector.share}%로 가장 커요.`
              : "섹터 정보가 없어요."
          }
        />
        <Metric
          title="배당 공백"
          value={emptyMonths.length === 0 ? "없음" : `${emptyMonths.length}개월`}
          note={
            emptyMonths.length === 0
              ? "열두 달 모두 배당이 들어와요."
              : `${emptyMonths.join("·")}월에는 들어오는 배당이 없어요.`
          }
        />
      </section>

      <ScoreCriteria />

      {actions.length > 0 && (
        <section>
          <h2 className="text-body-md font-bold text-primary">먼저 들여다볼 곳</h2>
          <ul className="mt-stack-md flex flex-col gap-stack-sm">
            {actions.map((a) => (
              <li
                key={a.kind}
                className="rounded-xl bg-surface-container-low p-4 text-body-md font-body-md"
              >
                <span className="mr-2 rounded-full bg-surface-container-high px-2.5 py-1 text-label-md font-label-md font-bold text-on-surface">
                  {ACTION_LABEL[a.kind]}
                </span>
                <strong className="text-primary">{a.name}</strong>{" "}
                <span className="text-on-surface-variant">({a.ticker})</span>
                <p className="mt-stack-sm text-label-md font-label-md text-on-surface-variant">
                  {a.reason}
                </p>
                <div className="mt-stack-sm">
                  <ScoreNarrative analysis={analysis[a.ticker]} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="rounded-xl bg-surface-container-low px-4 py-3 text-label-md font-label-md text-on-surface-variant">
        여기 있는 건 전부 <strong className="text-primary">검토 대상</strong>이지 매수·매도 권유가
        아니에요. 공개된 재무·배당 데이터로 계산한 참고 지표이고, 판단과 책임은 투자자 본인에게
        있어요. 근거 지표는 보유 현황 탭에서 종목별로 확인할 수 있어요.
      </p>
    </div>
  );
}
