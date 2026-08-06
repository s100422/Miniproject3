export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">플랜 상세</h1>
      <p className="mt-2 text-slate-600">plan id: {id} (상세 화면 준비 중)</p>
    </main>
  );
}
