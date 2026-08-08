import Link from "next/link";

const FAQS = [
  {
    q: "배당금이 뭐예요?",
    a: (
      <>
        기업이 벌어들인 이익 중 일부를 주주에게 현금으로 나눠주는 걸 배당금이라고
        해요. 주가가 오르내리는 것과 별개로, 주식을 갖고 있는 동안 정기적으로
        들어오는 돈이에요.
      </>
    ),
  },
  {
    q: "배당킹·배당귀족주는 뭔가요?",
    a: (
      <>
        매년 배당금을 줄이지 않고 오히려 계속 늘려온 기업들이 있어요. 이걸 25년
        이상 해온 기업을 <strong>배당귀족(Dividend Aristocrat)</strong>, 50년 이상
        해온 기업을 <strong>배당킹(Dividend King)</strong>이라고 불러요. 그만큼
        오랫동안 안정적으로 돈을 벌고 나눠준 기업이라는 뜻이라, 배당 투자를 처음
        시작할 때 참고하기 좋은 종목군이에요.
      </>
    ),
  },
  {
    q: "왜 매달 들어오는 게 핵심인가요?",
    a: (
      <>
        대부분의 미국 배당주는 1년에 4번(분기)만 배당을 줘요. 그런데 종목마다
        배당을 주는 달이 달라서, 지급월이 겹치지 않는 종목들을 잘 섞으면 매달
        조금씩이라도 배당금이 들어오는 포트폴리오를 만들 수 있어요. 이 서비스는
        그렇게 종목을 배분해서, 매달 여행비 정도의 배당금을 목표로 플랜을
        짜드려요.
      </>
    ),
  },
  {
    q: "얼마나 걸리나요?",
    a: (
      <>
        목표 금액이 클수록, 월 투자금이 적을수록 더 오래 걸려요. 그래서
        1년·5년·10년·15년·20년 시점의 예상 배당금을 시나리오로 보여드려서, 지금
        계획으로 목표에 얼마나 가까워지는지 한눈에 볼 수 있게 해요.
      </>
    ),
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-container-margin py-section-gap pb-[100px] md:pb-section-gap">
      <div className="mx-auto w-full max-w-[800px]">
        <div className="mb-section-gap text-center md:text-left">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 text-label-md font-label-md text-secondary">
            <span className="material-symbols-outlined icon-fill text-sm">
              school
            </span>
            <span>배당 투자 101</span>
          </div>
          <h1 className="mb-stack-md text-headline-lg-mobile font-headline-lg-mobile text-primary md:text-headline-lg md:font-headline-lg">
            배당주 투자란?
          </h1>
        </div>

        <div className="mb-section-gap flex flex-col gap-stack-md">
          {FAQS.map(({ q, a }, i) => (
            <details
              key={q}
              open={i === 0}
              className="group rounded-2xl border border-surface-container bg-surface-container-lowest p-6 shadow-[0_4px_12px_rgba(0,8,31,0.05)] transition-shadow hover:shadow-lg"
            >
              <summary className="flex w-full cursor-pointer list-none items-center justify-between text-left [&::-webkit-details-marker]:hidden">
                <h2 className="text-[20px] font-headline-md text-primary transition-colors group-hover:text-secondary">
                  {q}
                </h2>
                <span className="material-symbols-outlined text-on-surface-variant transition-transform duration-300 group-open:rotate-180">
                  expand_more
                </span>
              </summary>
              <p className="pt-gutter text-body-md font-body-md leading-relaxed text-on-surface-variant">
                {a}
              </p>
            </details>
          ))}
        </div>

        <div className="flex flex-col items-center justify-center gap-gutter border-t border-surface-variant pt-8 sm:flex-row">
          <Link
            href="/plan"
            className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-secondary px-8 py-4 text-label-md font-label-md text-on-secondary shadow-md transition-colors hover:bg-on-secondary-fixed-variant sm:w-auto"
          >
            <span>이제 플랜 만들기</span>
            <span className="material-symbols-outlined text-[20px]">
              arrow_forward
            </span>
          </Link>
          <Link
            href="/stocks"
            className="flex w-full items-center justify-center gap-2 rounded-[16px] border-2 border-outline-variant px-8 py-4 text-label-md font-label-md text-on-surface-variant transition-all hover:border-primary hover:bg-surface-container-low hover:text-primary sm:w-auto"
          >
            <span className="material-symbols-outlined text-[20px]">
              list_alt
            </span>
            <span>실제 종목 보기</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
