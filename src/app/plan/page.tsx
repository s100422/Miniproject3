import PlanBuilder from "@/components/PlanBuilder";

export default function PlanPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-container-margin py-section-gap pb-[100px] md:pb-section-gap">
      <div className="mx-auto mb-stack-lg max-w-2xl">
        <h2 className="text-headline-lg font-headline-lg text-primary md:text-display-lg md:font-display-lg">
          배당 모아 해외여행!
        </h2>
        <p className="mt-stack-md text-body-md font-body-md text-on-surface-variant">
          매달 여행비 정도의 배당금을 목표로, 배당킹/귀족주로 플랜을 짜드려요. 목표
          월배당금액과 월 투자계획금액을 입력하면 AI가 포트폴리오 후보 2개를 제안해요.
        </p>
      </div>

      <PlanBuilder />
    </main>
  );
}
