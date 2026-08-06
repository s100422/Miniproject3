import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { data, error } = await supabase
    .from("dividend_stocks")
    .select("ticker", { count: "exact" });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">
        배당으로 해외여행가자!
      </h1>
      <p className="mt-2 text-slate-600">
        매달 여행비 정도의 배당금을 목표로, 배당킹/귀족주로 플랜을 짜드려요.
      </p>

      <div className="mt-8 rounded-lg border border-slate-200 p-4">
        {error ? (
          <p className="text-red-600">Supabase 연결 실패: {error.message}</p>
        ) : (
          <p className="text-emerald-700">
            Supabase 연결 성공 — 큐레이션된 배당주 {data?.length ?? 0}개 확인됨
          </p>
        )}
      </div>

      <p className="mt-8 text-sm text-slate-400">
        입력 폼은 다음 단계에서 만들어요.
      </p>
    </main>
  );
}
