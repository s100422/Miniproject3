import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">배당주 투자란?</h1>

      <div className="mt-6 space-y-6 text-slate-700">
        <section>
          <h2 className="font-semibold text-slate-900">배당금이 뭐예요?</h2>
          <p className="mt-1 text-sm leading-relaxed">
            기업이 벌어들인 이익 중 일부를 주주에게 현금으로 나눠주는 걸 배당금이라고
            해요. 주가가 오르내리는 것과 별개로, 주식을 갖고 있는 동안 정기적으로
            들어오는 돈이에요.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">배당킹·배당귀족주는 뭔가요?</h2>
          <p className="mt-1 text-sm leading-relaxed">
            매년 배당금을 줄이지 않고 오히려 계속 늘려온 기업들이 있어요. 이걸 25년
            이상 해온 기업을 <strong>배당귀족(Dividend Aristocrat)</strong>, 50년 이상
            해온 기업을 <strong>배당킹(Dividend King)</strong>이라고 불러요. 그만큼
            오랫동안 안정적으로 돈을 벌고 나눠준 기업이라는 뜻이라, 배당 투자를
            처음 시작할 때 참고하기 좋은 종목군이에요.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">
            왜 "매달" 들어오는 게 핵심인가요?
          </h2>
          <p className="mt-1 text-sm leading-relaxed">
            대부분의 미국 배당주는 1년에 4번(분기)만 배당을 줘요. 그런데 종목마다
            배당을 주는 달이 달라서, 지급월이 겹치지 않는 종목들을 잘 섞으면
            매달 조금씩이라도 배당금이 들어오는 포트폴리오를 만들 수 있어요.
            이 서비스는 그렇게 종목을 배분해서, 매달 여행비 정도의 배당금을
            목표로 플랜을 짜드려요.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">얼마나 걸리나요?</h2>
          <p className="mt-1 text-sm leading-relaxed">
            목표 금액이 클수록, 월 투자금이 적을수록 더 오래 걸려요. 그래서
            1년·5년·10년·15년·20년 시점의 예상 배당금을 시나리오로 보여드려서,
            지금 계획으로 목표에 얼마나 가까워지는지 한눈에 볼 수 있게 해요.
          </p>
        </section>
      </div>

      <div className="mt-10 flex gap-3">
        <Link
          href="/plan"
          className="rounded bg-emerald-700 px-5 py-2 text-white"
        >
          이제 플랜 만들기
        </Link>
        <Link
          href="/stocks"
          className="rounded border border-slate-300 px-5 py-2 text-slate-700"
        >
          실제 종목 보기
        </Link>
      </div>
    </main>
  );
}
