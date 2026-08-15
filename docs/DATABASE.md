# 데이터 계층 참조

**스키마는 원격 Supabase에만 존재한다.** 레포에 `.sql`도, `supabase/migrations/`도,
`database.types.ts`도 없고 TS 타입은 파일마다 손으로 적혀 있다. 이 문서가 유일한
체크인된 스키마 기록이므로, DB를 바꾸면 여기도 같이 고칠 것.

프로젝트: `dividend-travel-planner` · ref `dvnebnuyhxmansnvkizl` · ap-northeast-2 · PG17
환경변수는 `.env.local`:

| 이름 | 용도 | 브라우저 노출 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | | 예 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | RLS 적용받는 공개 키 | 예 |
| `GEMINI_API_KEY` | 플랜 생성·리스크 검색 | 아니오 |
| `SUPABASE_SERVICE_ROLE_KEY` | **RLS 우회.** 야간 배치 쓰기 전용 | **절대 안 됨** |
| `CRON_SECRET` | 크론 라우트 인증. Vercel이 `Bearer`로 붙여 보낸다 | 아니오 |

뒤 두 개는 Vercel 환경변수에도 같은 값으로 있어야 한다(Production, Sensitive).

---

## 테이블 (public, 5개 — 전부 RLS 켜짐)

### `dividend_stocks` — 큐레이션 카탈로그, 86행, PK `ticker`

| 컬럼 | 타입 | null | 비고 |
|---|---|---|---|
| ticker | text | no | PK. `BF.B` 같은 클래스주 있음 |
| name | text | no | |
| market | text | no | 기본값 `'US'` — **어떤 코드도 읽지 않음** |
| dividend_yield | numeric | no | 퍼센트 (`2.55`) |
| consecutive_years | integer | no | `>=50` → "King", 그 외 "Aristocrat" |
| sector | text | no | GICS 영문명 (`Utilities`, `Health Care` …) |
| note | text | yes | **어떤 코드도 읽지 않음** |
| dividend_growth_5y | numeric | yes | 퍼센트 CAGR |
| business_summary | text | yes | 한글 한 줄 |
| payout_months | integer[] | no | `[3,6,9,12]` — 12개월 커버리지 규칙의 핵심 |

인덱스: PK만. 클라이언트는 **읽기 전용** (INSERT/UPDATE 정책 없음) — 카탈로그는
마이그레이션/대시보드로만 관리된다. 야후 값을 DB에 되쓰려면 **서비스롤 경로가 필요한데 아직 없다.**

### `plans` — 10행, PK `id`

`id` uuid · `created_at` timestamptz · `anonymous_id` uuid (NOT NULL) ·
`user_id` uuid (FK `auth.users`, nullable) · `name` text ·
`target_monthly_dividend` numeric · `monthly_investment` numeric ·
`allocations` jsonb · `chart_data` jsonb · `advice_text` text · `goal_achieved` boolean

인덱스: `plans_anonymous_id_idx`. **`user_id` 인덱스는 없다** (로그인 조회가 이걸로 필터하는데도).

`allocations[]` 원소 shape:
`{ ticker, weight_pct, reason, name, sector, business_summary, dividend_yield,
   dividend_growth_5y, payout_months, price: number|null,
   news: {kind,impact,reason,source_url}[] }`

> `news`는 2026-08-15에 `risk: {signal,reason,source_url}|null`을 대체했다. **그 전에 저장된
> 플랜에는 `risk` 키가 그대로 남아 있고, 화면은 더 이상 그걸 읽지 않는다** — 옛 플랜의
> 뉴스는 안 보인다. 스냅샷이라 마이그레이션하지 않았다.

`chart_data[]` = `YearlyProjection` = `{ year, base, growth, growthReinvest, growthReinvestReal }`.
마일스톤 연차(1/5/10/15/20/25/30)만 저장.

> 두 jsonb는 **의도적인 쓰기 시점 스냅샷**이다 — 옛 플랜이 만들어질 당시 숫자로 그대로 렌더되도록.

### `holding_transactions` — 거래 원장, 14행, PK `id`

`id` uuid · `user_id` uuid NOT NULL (FK, **ON DELETE CASCADE**) · `ticker` text ·
`name` text · `type` text `check in ('buy','sell')` · `quantity` numeric `check > 0` ·
`price` numeric `check >= 0` · `trade_date` date · `broker` text · `created_at` timestamptz

인덱스: PK만. **`user_id`·`trade_date` 인덱스 없음** (모든 쿼리가 둘 다 쓰는데도).

### `dividend_receipts` — 실제 수령 배당, 32행, PK `id`

`id` uuid · `user_id` uuid NOT NULL (FK) · `ticker` text · `name` text (비정규화) ·
`amount` numeric `check > 0` · `received_date` date · `created_at` timestamptz

**금액은 전부 세후라는 게 관례.** 인덱스: PK만.

### `ticker_analysis` — 야간 배치가 채우는 종목 점수, PK `(ticker, as_of)`

`as_of` date · `total_score`/`safety_score`/`growth_score`/`strength_score`/`value_score` numeric ·
`dividend_yield`/`dividend_growth_5y`/`price` numeric · `status` text `check in ('ok','partial','failed')` ·
`metrics` jsonb NOT NULL default `{}` · `news` jsonb **nullable, 기본값 없음** ·
`narrative` text nullable · `created_at` timestamptz

**덮어쓰지 않고 쌓는다.** PK에 `as_of`가 들어가서 하루 한 행씩 남고, 그 이력이 점수
가중치(40/25/20/15)를 나중에 튜닝할 근거가 된다. 같은 날 재실행은 그날 행만 upsert.

- **쓰기 정책이 아예 없다.** SELECT만 `true`라 anon 키로는 쓰기가 원천 차단되고,
  RLS를 우회하는 서비스롤(크론)만 쓴다 — `plans`의 실수를 반복하지 않는 형태.
- **`dividend_stocks`로 가는 FK를 일부러 안 걸었다.** 배당 삭감 후 카탈로그에서 빠지는
  종목(`LEG`, `TDS`)이 생기는데, FK가 있으면 검증에 쓸 과거 점수가 같이 사라진다.
- 인덱스는 PK뿐. "종목별 최신 행" 조회가 PK 순서로 커버되고 연 3만 행 규모다.
- `metrics`에 배당성향·FCF·부채·마진·함정 플래그와 결측 사유가 들어간다.
- **`news`의 `null`과 `[]`는 다른 뜻이다.** `null` = 뉴스 배치가 아직 이 종목을 못 봤다,
  `[]` = 봤는데 사건이 없다. 실패를 빈 배열로 적으면 검사 못 한 종목이 화면에서 깨끗한
  종목처럼 보인다. 그래서 기본값을 안 걸었다. 원소는
  `{ kind, impact: 'negative'|'positive', reason, source_url }`이고 티커당 최대 3건.
  `kind`는 `dividend_cut`/`dividend_increase`/`earnings`/`guidance`/`credit_rating`/
  `litigation`/`regulation`/`m_and_a` 8종(`riskScreen.ts`).
- **`narrative`는 AI가 쓴 점수 해설이다.** `null`이면 아직 안 돌았거나 **검증 게이트에서
  버려진 것**이다(`narrate.ts` — 프롬프트에 없던 숫자가 하나라도 있으면 문장을 통째로 버린다).
  둘을 구분하지 않는다: 어느 쪽이든 화면엔 해설이 없고 점수만 뜬다.
- **세 배치가 같은 행을 나눠 쓴다.** 점수는 `/api/analysis/refresh`(23:00 UTC)가 행을 만들고,
  `/api/analysis/news`(23:30)가 `news`를, `/api/analysis/narrate`(23:50)가 `narrative`를
  **이미 있는 최신 회차 행에만** 덧쓴다. 뒤 둘은 행을 새로 만들지 않는다 — `status` 기본값이
  `'ok'`라 점수 없는 행이 화면에서 정상으로 보이기 때문이다. 셋을 나눈 건 하나가 실행시간
  상한에 걸려 죽어도 나머지가 안 죽게 하려는 것이다.

### `holdings` 테이블은 없다

보유 현황은 `holding_transactions`에서 **메모리에서 계산**된다 —
`src/lib/holdings.ts`의 `aggregateHoldings` (이동평균 원가, 매도는 수량·원가만 줄이고
평단가 유지, 수량 ≤ 1e-9면 제외). 자체검사: `holdings.check.ts`.

---

## RLS 정책 (실제 적용값)

| 테이블 | 명령 | using / with check |
|---|---|---|
| dividend_stocks | SELECT | `true` |
| ticker_analysis | SELECT | `true` — **쓰기 정책 없음(서비스롤 전용)** |
| holding_transactions | ALL | `auth.uid() = user_id` |
| dividend_receipts | ALL | `auth.uid() = user_id` |
| plans | SELECT / INSERT / UPDATE / DELETE | **전부 `true`** |

> **`plans`에는 실질적인 행 보호가 없다.** 정책 이름과 달리 술어가 문자 그대로 `true`라,
> 소유권 필터링이 클라이언트 쿼리 빌더에서만 일어난다. 공개된 anon 키를 가진 누구나
> 모든 플랜을 읽고·이름 바꾸고·지울 수 있고, `/plans/[id]`는 소유권 검사 없이 id로 조회한다.
> 포트폴리오 두 테이블이 올바른 패턴이다. 고칠 때 `auth.uid()`가 익명 사용자에겐 null이라
> `anonymous_id`를 어떻게 묶을지 결정이 필요하다.

---

## 외부 데이터 소스

`/api/portfolio/prices`는 **야후가 브라우저 CORS를 막아서** 존재하는 서버 프록시일 뿐이다.
보유 종목 수(10개 안팎)만큼만 부르고, 현재가는 실시간이어야 해서 남겨뒀다.

**화면은 야후를 직접 부르지 않는다.** 배당 수익률·성장률은 야간 배치가 계산해
`ticker_analysis`에 넣어둔 값을 읽는다(`tickerAnalysis.ts`). 예전엔 `/stocks`·`/portfolio`·`/plan`
세 화면이 진입할 때마다 86종목을 야후에 던졌는데, 그 경로를 만들던 `/api/stocks/rates`는 삭제했다.
대량 요청은 이제 크론 한 곳에서 하루 한 번만 나간다.

| 소스 | 엔드포인트 | 뽑는 것 |
|---|---|---|
| 야후 현재가<br>`stockPrice.ts` | `/v8/finance/chart/{sym}?interval=1d&range=1d` | `meta.regularMarketPrice` 하나. 타임아웃 5s |
| 야후 배당이력<br>`dividendRates.ts` | `/v8/finance/chart/{sym}?range=8y&interval=1d&events=div` | **8년치 일별 주가 + 배당 이벤트.** 타임아웃 8s |
| 야후 재무<br>`fundamentals.ts` | `query2` `/ws/fundamentals-timeseries/v1/finance/timeseries/{sym}` | 연간 재무 4년치. 타임아웃 10s |
| Gemini 플랜생성<br>`gemini.ts` | `gemini-2.5-flash:generateContent` + `responseSchema` | 배분안 2개. 타임아웃 **없음** |
| Gemini 뉴스<br>`riskScreen.ts` | 같은 모델 + `tools:[{google_search:{}}]` | 티커당 1콜, 동시성 12. 타임아웃 12s. **야간 배치 전용** |
| Gemini 해설<br>`narrate.ts` | 같은 모델 + `responseSchema` (**웹검색 없음**) | 티커당 1콜, 동시성 12. 타임아웃 12s. **야간 배치 전용** |

호스트는 `https://query1.finance.yahoo.com`, 헤더 `User-Agent: Mozilla/5.0`.
`toQuoteSymbol`이 `BF.B` → `BF-B` 변환.

`dividendRates.ts` 파생값:
- `dividend_yield` = 최근 365일 배당 합 ÷ 현재가 × 100 (×4 아님 — 분기/반기 배당 모두 대응)
- `dividend_growth_5y` = 직전 **완료된** 역년 vs 5년 전의 CAGR

### 알아둘 함정

- **Gemini는 `responseSchema`와 `google_search`를 동시에 못 쓴다.** 그래서 `riskScreen.ts`가
  JSON 대신 `종류|부호|근거` 줄 형식을 파싱한다. 구조화 출력과 웹검색은 항상 별개 호출.
  검색이 필요 없는 `narrate.ts`는 `responseSchema`를 쓰므로 형식 파싱이 아예 없다.
- **`narrate.ts`의 검증은 프롬프트 문자열 자체를 기준으로 한다.** 사실 블록에 없는 숫자가
  답변에 있으면 환각으로 보고 문장을 버린다. 그래서 프롬프트와 검증 기준이 갈라질 수 없다 —
  둘 다 같은 문자열에서 나온다. 지표를 추가하면 사실 블록에만 넣으면 되고 검증기는 안 건드린다.
- **출처 URL은 답변 텍스트가 아니라 `groundingMetadata`로 온다.** 한 응답에서 사건이 여러 건
  나오므로 첫 `groundingChunk`를 전건에 갖다 붙이면 소송 근거에 배당 기사 링크가 붙는다.
  `groundingSupports`(문장 구간 → chunk 색인)로 건별 귀속하고, 못 찾으면 그 건을 버린다.
  예외는 chunk가 하나뿐일 때뿐. 파서 자체검사: `riskScreen.check.ts`(네트워크 안 탄다).
- **Gemini 프로젝트에 월 지출 상한이 걸리면 전 호출이 429다.** fail-open이라 화면엔 아무
  표시가 없고 뉴스만 조용히 비어 보인다. 뉴스가 통째로 안 뜨면 배치 응답의 `checked`부터 볼 것
  (<https://ai.studio/spend>).
- **`dividend_stocks`의 값은 폴백이다.** `dividend_yield`/`dividend_growth_5y`는 손입력이고,
  `ticker_analysis`에 배치가 계산한 값이 있으면 그쪽이 우선한다. **카탈로그에 되쓰지는 않는다.**
- **Next 캐시 계층은 여전히 0건이다** (`revalidate`·`cache:`·`use cache` 전부 안 씀).
  필요가 없어졌기 때문이다 — 화면이 야후 대신 사전계산 테이블을 읽는다.
- **동시 요청은 6개로 묶여 있다** (`stockPrice.ts`의 `mapLimit`/`YAHOO_CONCURRENCY`).
  전량 병렬은 429 위험이 커서 `fetchDividendRates`·`fetchFundamentals`가 이걸 거친다.
- **전 계층 fail-open.** 실패한 티커는 조용히 빠지고 요청 자체는 성공한다.
  **예외는 `fetchFundamentals`** — 실패를 사유와 함께 돌려준다(조용히 빼면 위험 노출도가 틀린다).
- 재무제표(배당성향·부채·마진)는 `chart`에 **없다** — `fundamentals.ts`가 따로 받는다. 아래 절 참고.

### fundamentals-timeseries — 재무 지표는 여기서 받는다 (2026-08-15 확인)

```
query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{sym}
  ?symbol={sym}&type=annualFreeCashFlow,...&period1={unix}&period2={unix}
```

**쿠키도 크럼도 필요 없다.** `User-Agent`만 붙이면 200이고, `chart` 엔드포인트와 같은 방식이다.
`period1`/`period2`는 필수. 응답은 `timeseries.result[]`이고 각 원소가
`{ meta, <type>: [{asOfDate, reportedValue:{raw}} | null, ...] }` — **배열에 null이 섞여 온다.**

카탈로그 86종목 전량 실측(동시성 6, 5.2초): **실패 0건, 결측 0인 종목 78개.**
빈 지표는 `operatingIncome` 6종목, `ebitda` 6종목, `interestExpense` 2종목뿐.
`BF.B` → `BF-B` 변환도 여기서 통한다.

- **값은 연간(회계연도) 확정치다.** TTM보다 최대 1년 묵을 수 있는 대신 분기/TTM 기준이
  섞이는 사고가 없다. `asOfDate`를 같이 저장해 화면에 노출한다.
- **`annualFreeCashFlow`는 믿을 수 있다.** JNJ 19.313B = 영업현금흐름 24.53B − capex 5.217B로
  정확히 맞는다. 안 오는 종목은 그 뺄셈으로 복구한다.
- **순부채 필드는 없다.** `annualTotalDebt - annualCashAndCashEquivalents`로 직접 계산.
- **금액 부호가 항목마다 다르다.** `annualCashDividendsPaid`·`annualCapitalExpenditure`는
  음수로 온다. 부호 관례를 믿지 말고 절댓값을 쓸 것.
- **실패해도 200에 에러 봉투(`timeseries.error`)가 실려 온다.** 확인하지 않으면 "값이 빈 종목"처럼
  조용히 흘러가서 점수가 조용히 틀린다.

#### 배당성향 분모는 영업현금흐름(OCF)이다 — 이유

순이익 기준도 FCF 기준도 특정 섹터에서 구조적으로 깨진다. 86종목 실측 중앙값:

| 섹터 | n | FCF 기준 | OCF 기준 | capex/OCF |
|---|---|---|---|---|
| Utilities | 11 | 146% (**10종목은 FCF가 음수라 계산 불가**) | 27% | 122% |
| Real Estate | 1 | 117% | 62% | 47% |
| Consumer Staples | 17 | 65% | 50% | 26% |
| Industrials | 21 | 36% | 28% | 16% |
| Financials | 11 | 26% | 23% | 8% |

- **순이익 기준**은 REIT에서 깨진다 — `O` 276%, `VTR` 342%. 감가상각 때문이고 FFO/AFFO가
  있어야 맞는데 야후엔 없다.
- **FCF 기준**은 유틸리티에서 깨진다 — 규제 유틸리티는 설비투자를 부채로 조달해서 FCF가
  구조적으로 음수다(`ED` 3239%, 나머지 10종목은 계산 불가). 섹터별 임계값으로도 구제가 안 된다.
- **OCF 기준**은 전 섹터에서 값이 존재하고 해석된다. capex 부담은 버리지 않고
  `capex/OCF`를 기업체력 축의 별도 지표로 옮겼다.

> **quoteSummary는 쓰지 않는다.** 쿠키+크럼(왕복 3회, 401 재발급)을 요구하는데,
> 정작 `cashflowStatementHistory`가 `endDate`와 `netIncome`만 남기고 비어버려서
> (2026-08-15 확인) 재무 항목을 못 준다. `financialData.freeCashflow`도 값이 틀린다
> (MSFT 16.5B, 실제 67B). timeseries가 같은 데이터를 인증 없이 더 정확하게 준다.

---

## 인증

Supabase Auth 이메일+비밀번호, **클라이언트 전용**. SSR/쿠키 헬퍼도 미들웨어도 없다.
`src/lib/supabase.ts`가 anon 키로 만든 브라우저 클라이언트 하나이고,
**API 라우트도 같은 모듈을 import한다** — 즉 서버 측 DB 접근도 anon으로 돌고
세션이 없다. 지금은 공개 카탈로그만 읽어서 문제가 안 될 뿐이다.

**예외가 하나 있다: `src/lib/supabaseAdmin.ts`.** 서비스롤 키로 RLS를 우회하는
클라이언트이고 `/api/analysis/refresh`(야간 배치)만 쓴다. `ticker_analysis`에 SELECT 정책만
있어서 anon으론 쓰기가 원천 차단되기 때문이다. 함수 형태로 만들어 두 가지를 막았다 —
`typeof window !== "undefined"`면 즉시 throw하고, 키가 없어도 throw한다(모듈 로드 시점이
아니라 호출 시점이라 빌드는 안 깨진다). `server-only` 패키지는 쓰지 않는다(미설치).

**이중 신원 모델:** `plans`는 `anonymous_id`(localStorage UUID, `anonymousId.ts`)와
nullable `user_id`를 둘 다 갖는다. insert 때 둘 다 쓰고, 읽을 때 세션 유무로 필터를 고른다.
포트폴리오 테이블은 로그인 전용(`user_id` NOT NULL).
