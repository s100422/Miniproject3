# 데이터 계층 참조

**스키마는 원격 Supabase에만 존재한다.** 레포에 `.sql`도, `supabase/migrations/`도,
`database.types.ts`도 없고 TS 타입은 파일마다 손으로 적혀 있다. 이 문서가 유일한
체크인된 스키마 기록이므로, DB를 바꾸면 여기도 같이 고칠 것.

프로젝트: `dividend-travel-planner` · ref `dvnebnuyhxmansnvkizl` · ap-northeast-2 · PG17
환경변수는 `.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`

---

## 테이블 (public, 4개 — 전부 RLS 켜짐)

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
   dividend_growth_5y, payout_months, price: number|null, risk: {signal,reason,source_url}|null }`

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

### `holdings` 테이블은 없다

보유 현황은 `holding_transactions`에서 **메모리에서 계산**된다 —
`src/lib/holdings.ts`의 `aggregateHoldings` (이동평균 원가, 매도는 수량·원가만 줄이고
평단가 유지, 수량 ≤ 1e-9면 제외). 자체검사: `holdings.check.ts`.

---

## RLS 정책 (실제 적용값)

| 테이블 | 명령 | using / with check |
|---|---|---|
| dividend_stocks | SELECT | `true` |
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

두 라우트(`/api/portfolio/prices`, `/api/stocks/rates`)는 **야후가 브라우저 CORS를 막아서**
존재하는 서버 프록시일 뿐이다.

| 소스 | 엔드포인트 | 뽑는 것 |
|---|---|---|
| 야후 현재가<br>`stockPrice.ts` | `/v8/finance/chart/{sym}?interval=1d&range=1d` | `meta.regularMarketPrice` 하나. 타임아웃 5s |
| 야후 배당이력<br>`dividendRates.ts` | `/v8/finance/chart/{sym}?range=8y&interval=1d&events=div` | **8년치 일별 주가 + 배당 이벤트.** 타임아웃 8s |
| Gemini 플랜생성<br>`gemini.ts` | `gemini-2.5-flash:generateContent` + `responseSchema` | 배분안 2개. 타임아웃 **없음** |
| Gemini 리스크<br>`riskScreen.ts` | 같은 모델 + `tools:[{google_search:{}}]` | 티커당 1콜 병렬. 타임아웃 12s |

호스트는 `https://query1.finance.yahoo.com`, 헤더 `User-Agent: Mozilla/5.0`.
`toQuoteSymbol`이 `BF.B` → `BF-B` 변환.

`dividendRates.ts` 파생값:
- `dividend_yield` = 최근 365일 배당 합 ÷ 현재가 × 100 (×4 아님 — 분기/반기 배당 모두 대응)
- `dividend_growth_5y` = 직전 **완료된** 역년 vs 5년 전의 CAGR

### 알아둘 함정

- **Gemini는 `responseSchema`와 `google_search`를 동시에 못 쓴다.** 그래서 `riskScreen.ts`가
  JSON 대신 선두 토큰(`CUT|INCREASE|NONE`)을 파싱한다. 구조화 출력과 웹검색은 항상 별개 호출.
- **라이브 값이 DB 값을 덮어쓴다 (메모리에서만).** DB의 `dividend_yield`/`dividend_growth_5y`는
  폴백일 뿐이고 야후 값이 우선한다. **DB에 되쓰지는 않는다.**
- **캐시가 어디에도 없다.** `revalidate`·`cache:`·`unstable_cache`·인메모리 메모 전부 0건.
  `/stocks`와 `/portfolio`는 진입할 때마다 야후에 **86건을 동시 요청**한다. 레이트리밋도 없다.
- **전 계층 fail-open.** 실패한 티커는 조용히 빠지고 요청 자체는 성공한다.
- 재무제표(배당성향·부채·마진)는 `chart`에 **없다** — `quoteSummary`에 있고 쿠키/크럼
  인증을 요구할 수 있다. 쓰기 전에 반드시 접근 가능 여부를 먼저 확인할 것.

---

## 인증

Supabase Auth 이메일+비밀번호, **클라이언트 전용**. SSR/쿠키 헬퍼도 미들웨어도 없다.
`src/lib/supabase.ts`가 anon 키로 만든 브라우저 클라이언트 하나이고,
**API 라우트도 같은 모듈을 import한다** — 즉 서버 측 DB 접근도 anon으로 돌고
세션이 없다. 지금은 공개 카탈로그만 읽어서 문제가 안 될 뿐이다.

**이중 신원 모델:** `plans`는 `anonymous_id`(localStorage UUID, `anonymousId.ts`)와
nullable `user_id`를 둘 다 갖는다. insert 때 둘 다 쓰고, 읽을 때 세션 유무로 필터를 고른다.
포트폴리오 테이블은 로그인 전용(`user_id` NOT NULL).
