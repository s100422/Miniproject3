import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { narrateAll } from "@/lib/narrate";
import type { TickerAnalysis } from "@/lib/tickerAnalysis";

/**
 * 야간 해설 배치. 점수 배치가 채운 최신 회차 행에 `narrative`를 덧붙인다
 * (docs/ROADMAP.md Phase 3).
 *
 * **AI는 여기서만 돈다.** 사용자별 진단은 이 종목 단위 해설을 코드가 조합해서 만들기 때문에
 * 사용자가 몇 명이든 호출 수가 안 변한다.
 *
 * Vercel 크론이 `Authorization: Bearer $CRON_SECRET`을 붙여 GET으로 호출한다.
 */

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았다" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // 뉴스 배치와 같은 이유로 행을 새로 만들지 않는다 — `status` 기본값이 'ok'라
  // 점수 없는 행이 화면에서 정상으로 보인다.
  const { data: latest } = await supabase
    .from("ticker_analysis")
    .select("as_of")
    .order("as_of", { ascending: false })
    .limit(1);
  const as_of: string | undefined = latest?.[0]?.as_of;
  if (!as_of) {
    return NextResponse.json({ error: "점수 배치 결과가 아직 없다" }, { status: 503 });
  }

  const { data: rows } = await supabase.from("ticker_analysis").select("*").eq("as_of", as_of);
  const analyses = (rows ?? []) as TickerAnalysis[];

  const narratives = await narrateAll(analyses, startedAt + (maxDuration - 15) * 1000);

  const written = Object.keys(narratives);
  const { error: writeError } = await supabaseAdmin()
    .from("ticker_analysis")
    .upsert(
      written.map((ticker) => ({ ticker, as_of, narrative: narratives[ticker] })),
      { onConflict: "ticker,as_of" }
    );
  if (writeError) {
    return NextResponse.json({ error: `저장 실패: ${writeError.message}` }, { status: 500 });
  }

  const eligible = analyses.filter((r) => r.status !== "failed" && r.total_score != null).length;
  return NextResponse.json({
    as_of,
    total: analyses.length,
    // 점수가 있어 해설을 시도할 수 있는 종목 수. 이보다 written이 적으면 호출이 실패했거나
    // 검증 게이트에서 버려진 것이다 — 둘 다 narrative가 null로 남는다.
    eligible,
    written: written.length,
    elapsed_ms: Date.now() - startedAt,
  });
}
