import { NextRequest, NextResponse } from "next/server";
import { fetchDividendRates } from "@/lib/dividendRates";

// 야후 파이낸스는 브라우저에서 직접 호출하면 CORS로 막혀서, 서버 라우트를 거쳐야 한다.
export async function GET(req: NextRequest) {
  const tickers = req.nextUrl.searchParams.get("tickers")?.split(",").filter(Boolean) ?? [];
  const rates = await fetchDividendRates(tickers);
  return NextResponse.json({ rates });
}
