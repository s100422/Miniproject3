# Gemini 프롬프트 초안 (배당 플랜 생성)

실제 API 연동은 나중에 하기로 했고, 지금은 프롬프트 설계 + 결정론적 계산/검증 로직만 미리 만들어서 손으로 시뮬레이션 테스트를 거쳤다. 테스트 코드는 세션 스크래치패드의 `dividend_calc.py`(계산) / `validate_ai_response.py`(검증)를 참고.

## 역할 분리 원칙
- **AI(Gemini)가 하는 일**: 종목별 배분(티커/비중), 후보 컨셉 한 줄, 전략 조언 텍스트 — 딱 이 3가지만
- **서버 코드가 하는 일**: 가중평균 배당수익률, 목표 도달 개월수, 연차별 누적배당금 그래프 — 전부 결정론적 계산. AI 응답에 숫자 계산을 맡기지 않음

## System Instruction

```
당신은 배당투자 플래너 AI입니다. 사용자의 목표와 아래 제공된 배당주 리스트만 사용해서
포트폴리오 배분안 2가지를 제안하세요.

규칙:
1. allocations에 사용하는 티커는 반드시 제공된 리스트 안에 있는 것만 사용하세요.
   리스트에 없는 종목은 절대 만들어내지 마세요.
2. 매달 배당이 들어오는 게 이 서비스의 핵심 가치입니다. 각 후보의 allocations는
   payout_cycle A, B, C 그룹에서 각각 최소 1개 종목을 포함해야 합니다.
3. weight_pct의 합은 정확히 100이어야 합니다.
4. period_months는 [period_min, period_max] 범위 안, monthly_investment는
   [budget_min, budget_max] 범위 안의 값이어야 합니다.
5. 두 후보는 서로 다른 트레이드오프를 가져야 합니다(예: 하나는 우량주 중심으로 균형있게,
   다른 하나는 고배당 위주로 예산을 아끼는 방향 등). concept 필드에 한 줄로 그 차이를
   요약하세요.
6. 목표 월배당금액을 이 조합으로 정확히 달성할 수 없다면, 가장 근접한 조합 2개를
   제시하고 advice_text에 얼마나 부족한지와 이유를 설명하세요. 근거 없이 "정확히
   달성 가능"이라고 말하지 마세요.
7. 금액 계산(연차별 배당금, 목표 도달 시점)은 당신이 하지 않습니다 — 서버가 별도로
   계산합니다. 당신은 배분과 조언만 담당합니다. period_months와 monthly_investment는
   "이 정도면 목표에 근접하겠다"는 판단으로 고르는 값이며, 정확한 도달 시점 확정은
   서버 몫입니다.
8. advice_text에는 배분 이유와 함께 전략적 매수/매도 조언을 1~2문장 포함하세요
   (예: 분할매수 방법, 목표 도달 후 재조정 방법 등).

다른 텍스트 없이 아래 JSON 형식으로만 응답하세요.
```

## 출력 스키마 (Gemini `responseSchema` / `responseMimeType: application/json`)

```json
{
  "type": "object",
  "properties": {
    "candidates": {
      "type": "array",
      "minItems": 2,
      "maxItems": 2,
      "items": {
        "type": "object",
        "properties": {
          "concept": { "type": "string" },
          "period_months": { "type": "integer" },
          "monthly_investment": { "type": "number" },
          "allocations": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "ticker": { "type": "string" },
                "weight_pct": { "type": "number" }
              },
              "required": ["ticker", "weight_pct"]
            }
          },
          "advice_text": { "type": "string" }
        },
        "required": ["concept", "period_months", "monthly_investment", "allocations", "advice_text"]
      }
    }
  },
  "required": ["candidates"]
}
```

## 사용자 입력 템플릿 (매 호출마다 채워서 전달)

```
목표 월배당금액: ${target_monthly_dividend}
희망 기간 범위: {period_min}~{period_max}개월  ← 입력 화면은 "년" 단위로 받고, 여기 넣기 전에 ×12 환산
월 투자 가능 금액 범위: ${budget_min}~${budget_max}
사용 가능한 배당주 리스트(JSON): [{ticker, name, dividend_yield, consecutive_years, sector, payout_cycle}, ... 25종목 전체]
```

## 손으로 시뮬레이션한 결과 (실제 API 없이 사전 검증)

목표 $150/월, 기간 10~20년(120~240개월), 예산 $200~400/월인 시나리오로 "AI가 낼 법한" 응답을 만들어서 계산기/검증 로직을 돌려봤다.

| | 후보 1 | 후보 2 |
|---|---|---|
| concept | 균형있게, 우량 대형주 중심 | 고배당 위주, 적은 예산으로 접근 |
| 배분 | FRT 20 · PG 20 · TGT 20 · JNJ 15 · CAT 15 · MDT 10 | MO 30 · FRT 20 · CVX 20 · ABBV 15 · ITW 15 |
| monthly_investment | $400 | $250 |
| 가중평균 수익률(서버 계산) | 2.74% | 4.13% |
| period_months(서버 계산 결과와 비교) | 164개월(13.7년) | 174개월(14.5년) |
| 사이클 커버 | A(FRT,MDT)·B(PG,CAT)·C(TGT,JNJ) ✓ | A(MO,FRT,ITW)·B(ABBV)·C(CVX) ✓ |

검증 로직(`validate_ai_response.py`)으로 정상 케이스 통과 + 환각 티커/사이클 누락/범위 밖 3가지 실패 케이스가 전부 정상적으로 걸러지는 것까지 확인함.

## 다음에 할 일 (실제 API 연동 시)
- Gemini API 키 연결 후 이 프롬프트로 실제 호출 → 자유 형식 응답이 스키마를 실제로 지키는지, advice_text 품질이 괜찮은지 확인
- 실제 응답에서도 `validate_ai_response.py` 로직을 서버 코드로 그대로 옮겨서 검증 후 저장
