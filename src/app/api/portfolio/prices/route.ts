import { NextRequest, NextResponse } from "next/server";
import { fetchPrices } from "@/lib/stockPrice";

// Yahoo Finance는 브라우저에서 직접 호출하면 CORS로 막혀서, 서버 라우트를 거쳐야 한다.
export async function GET(req: NextRequest) {
  const tickers = req.nextUrl.searchParams.get("tickers")?.split(",").filter(Boolean) ?? [];
  const prices = await fetchPrices(tickers);
  return NextResponse.json({ prices });
}
