@AGENTS.md

# DB 스키마

Supabase 스키마는 레포에 마이그레이션 파일이 없고 원격에만 있다. 테이블 구조·RLS·
외부 API·인증 모델은 `docs/DATABASE.md`에 정리돼 있으니 DB를 건드리기 전에 그걸 읽을 것
(라이브 DB를 다시 조사하지 말 것). DB를 바꾸면 그 문서도 같이 갱신한다.

# 진행 중인 작업

보유 배당주 진단·조언 기능을 단계적으로 만들고 있다. 채택한 구조와 Phase 0~3이
`docs/ROADMAP.md`에 있다. "Phase N"을 하라는 요청을 받으면 먼저 그 문서를 읽을 것.
단계를 끝내면 그 문서의 상태 표시도 갱신한다. **Phase 0~1 완료, 다음은 Phase 2(뉴스 계층).**

# 자체검사

`src/lib/*.check.ts`는 tsconfig에서 제외돼 있어 `tsc`가 안 본다. 이렇게 돌린다:

```
node_modules/.bin/jiti src/lib/dividendScore.check.ts
```

`jiti`는 Next가 이미 의존하는 패키지다(새로 깔지 말 것). `fundamentals`·`dividendScore.backtest`는
네트워크를 실제로 탄다. **점수 임계값을 손대면 `dividendScore.backtest.check.ts`를 반드시 돌릴 것** —
실제 배당 삭감 사례로 판정식을 검증하는 유일한 장치다.
