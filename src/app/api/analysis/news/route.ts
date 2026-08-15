import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { screenNews } from "@/lib/riskScreen";

/**
 * 야간 뉴스 배치. 점수 배치가 채운 최신 회차 행에 `news`를 덧붙인다(docs/ROADMAP.md Phase 2).
 *
 * **점수 배치(`/api/analysis/refresh`)와 라우트를 나눴다.** 86종목 그라운딩 검색이 실행시간
 * 상한에 걸려 죽어도 점수 배치는 이미 끝나 있어야 하고, 반대로 뉴스가 없어도 점수는 떠야 한다.
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

  // **오늘 날짜로 새 행을 만들지 않고 이미 있는 회차에만 붙인다.** `status`의 기본값이 'ok'라
  // 뉴스만 든 행을 새로 넣으면 점수 없는 종목이 화면에서 정상으로 보인다.
  const { data: latest } = await supabase
    .from("ticker_analysis")
    .select("as_of")
    .order("as_of", { ascending: false })
    .limit(1);
  const as_of: string | undefined = latest?.[0]?.as_of;
  if (!as_of) {
    return NextResponse.json({ error: "점수 배치 결과가 아직 없다" }, { status: 503 });
  }

  const { data: rows } = await supabase.from("ticker_analysis").select("ticker").eq("as_of", as_of);
  const tickers = (rows ?? []).map((r) => r.ticker as string);

  // 남는 시간을 넘겨 서버리스 상한 전에 스스로 멈추게 한다. 여유 15초는 저장에 쓴다.
  const news = await screenNews(tickers, startedAt + (maxDuration - 15) * 1000);

  const checked = Object.keys(news);
  const { error: writeError } = await supabaseAdmin()
    .from("ticker_analysis")
    .upsert(
      checked.map((ticker) => ({ ticker, as_of, news: news[ticker] })),
      { onConflict: "ticker,as_of" }
    );
  if (writeError) {
    return NextResponse.json({ error: `저장 실패: ${writeError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    as_of,
    total: tickers.length,
    // 검사에 실패한 종목은 news가 null로 남는다 — "사건 없음"(빈 배열)과 구분된다.
    checked: checked.length,
    with_events: checked.filter((t) => news[t].length > 0).length,
    events: checked.reduce((n, t) => n + news[t].length, 0),
    elapsed_ms: Date.now() - startedAt,
  });
}
