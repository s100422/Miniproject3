// 수동 실행 전용 점검 스크립트 (앱 런타임에 안 물림, CI에도 안 걸음):
//   node --env-file=.env.local src/lib/dividendStocksAnomalies.check.ts
//
// dividend_yield·dividend_growth_5y는 이제 야후 실시간 계산이라 이 스크립트에서 다루지 않는다.
// consecutive_years·sector는 가격 데이터로 검증 불가능해서, "그럴듯하지만 틀렸을 수 있는" 값을
// 통계적으로 의심스러운 패턴만 걸러낸다(웹검색 없이 공짜로 상시 실행 가능) — 완전한 검증은 아니다.
import { supabase } from "./supabase.ts";

type Row = { ticker: string; name: string; sector: string; business_summary: string; consecutive_years: number };

function editDistance1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (a.length === b.length) {
      i++;
      j++;
    } else if (a.length > b.length) {
      i++;
    } else {
      j++;
    }
  }
  return true;
}

function isAnagram(a: string, b: string): boolean {
  if (a === b || a.length !== b.length) return false;
  return [...a].sort().join("") === [...b].sort().join("");
}

// 강한 신호만 넣는다 — 애매한 키워드로 과탐(false positive)을 만들면 이 체크 자체를 안 믿게 된다.
const SECTOR_KEYWORDS: { sector: string; patterns: RegExp }[] = [
  { sector: "Financials", patterns: /보험사|보험을 판매|보험 중개|보험 계약|자산운용|은행 지주|Bank|Insurance|Bancshares/i },
  { sector: "Real Estate", patterns: /리츠|부동산을 소유·임대|Realty|REIT/i },
  { sector: "Health Care", patterns: /제약회사|처방약|의약품 포장재|Pharmaceutical/i },
  { sector: "Utilities", patterns: /전기·가스를 공급|전력회사|가스회사|수도를 공급|수도회사/i },
  { sector: "Energy", patterns: /석유·천연가스를 시추|정유회사/i },
];

async function main() {
  const { data, error } = await supabase
    .from("dividend_stocks")
    .select("ticker, name, sector, business_summary, consecutive_years");
  if (error || !data) {
    console.error("조회 실패:", error);
    process.exit(1);
  }
  const rows = data as Row[];
  const flags: string[] = [];

  for (const r of rows) {
    if (r.consecutive_years <= 0 || r.consecutive_years > 100) {
      flags.push(`[범위이탈] ${r.ticker}: consecutive_years=${r.consecutive_years}`);
    } else if (r.consecutive_years < 25) {
      flags.push(
        `[전제위반] ${r.ticker}: consecutive_years=${r.consecutive_years} — King(50+)·Aristocrat(25+) 카탈로그인데 25 미만`
      );
    }
  }

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.consecutive_years !== b.consecutive_years) continue;
      if (isAnagram(a.ticker, b.ticker) || editDistance1(a.ticker, b.ticker)) {
        flags.push(
          `[티커유사+값동일] ${a.ticker}(${a.consecutive_years}) / ${b.ticker}(${b.consecutive_years}) — 철자만 비슷한 두 종목의 연속배당연수가 똑같음(복붙 실수 의심)`
        );
      }
    }
  }

  for (const r of rows) {
    const text = `${r.name} ${r.business_summary}`;
    for (const { sector, patterns } of SECTOR_KEYWORDS) {
      if (patterns.test(text) && r.sector !== sector) {
        flags.push(
          `[섹터불일치] ${r.ticker}: 설명("${r.business_summary}")은 ${sector} 같은데 저장된 sector는 "${r.sector}"`
        );
      }
    }
  }

  if (flags.length === 0) {
    console.log(`이상 없음 (${rows.length}개 종목 점검)`);
    return;
  }
  console.log(`${flags.length}건 의심 발견 (${rows.length}개 종목 중):\n`);
  flags.forEach((f) => console.log("- " + f));
}

main();
