import PlanBuilder from "@/components/PlanBuilder";

export default function PlanPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">배당으로 해외여행가자!</h1>
      <p className="mt-2 text-slate-600">
        매달 여행비 정도의 배당금을 목표로, 배당킹/귀족주로 플랜을 짜드려요. 목표
        월배당금액과 월 투자계획금액을 입력하면 AI가 포트폴리오 후보 2개를 제안해요.
      </p>

      <div className="mt-8">
        <PlanBuilder />
      </div>
    </main>
  );
}
