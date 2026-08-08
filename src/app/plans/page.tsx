"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getAnonymousId } from "@/lib/anonymousId";

type PlanSummary = {
  id: string;
  created_at: string;
  name: string | null;
  target_monthly_dividend: number;
  monthly_investment: number;
};

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: session } = await supabase.auth.getSession();
    const query = supabase
      .from("plans")
      .select("id, created_at, name, target_monthly_dividend, monthly_investment")
      .order("created_at", { ascending: false });

    const { data } = session.session
      ? await query.eq("user_id", session.session.user.id)
      : await query.eq("anonymous_id", getAnonymousId());

    setPlans(data ?? []);
  }

  function startRename(p: PlanSummary) {
    setRenamingId(p.id);
    setNameInput(p.name ?? "");
  }

  async function saveRename(id: string) {
    const trimmed = nameInput.trim();
    await supabase.from("plans").update({ name: trimmed || null }).eq("id", id);
    setPlans((prev) => prev?.map((p) => (p.id === id ? { ...p, name: trimmed || null } : p)) ?? null);
    setRenamingId(null);
  }

  async function deletePlan(id: string) {
    if (!confirm("이 플랜을 삭제할까요?")) return;
    await supabase.from("plans").delete().eq("id", id);
    setPlans((prev) => prev?.filter((p) => p.id !== id) ?? null);
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto px-container-margin py-section-gap">
      <div className="flex justify-between items-center mb-stack-lg">
        <h2 className="text-headline-lg font-headline-lg md:text-display-lg md:font-display-lg text-primary">
          저장된 플랜
        </h2>
        <Link
          href="/plan"
          className="bg-primary text-on-primary rounded-[16px] px-6 py-3 text-label-md font-label-md flex items-center gap-2 hover:bg-primary-container transition-colors shadow-md"
        >
          <span className="material-symbols-outlined">add</span>
          새 플랜 만들기
        </Link>
      </div>

      {plans === null && (
        <p className="text-body-md font-body-md text-on-surface-variant">불러오는 중...</p>
      )}

      {plans?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-section-gap text-center">
          <div className="w-24 h-24 bg-surface-container-low rounded-full flex items-center justify-center mb-stack-lg">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: "48px" }}>
              beach_access
            </span>
          </div>
          <h3 className="text-headline-md font-headline-md text-primary mb-stack-sm">
            저장된 플랜이 없습니다
          </h3>
          <p className="text-body-md font-body-md text-on-surface-variant mb-stack-lg">
            새로운 여행 목표를 세우고 배당금 투자를 시작해보세요.
          </p>
          <Link
            href="/plan"
            className="bg-primary text-on-primary rounded-[16px] px-6 py-3 text-label-md font-label-md hover:bg-primary-container transition-colors"
          >
            첫 플랜 만들기
          </Link>
        </div>
      )}

      {plans && plans.length > 0 && (
        <div className="grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3 gap-gutter">
          {plans.map((p) => (
            <div
              key={p.id}
              className="bg-surface-container-lowest rounded-2xl p-stack-lg shadow-[0_4px_12px_rgba(0,8,31,0.05)] border border-surface-container-low flex flex-col gap-stack-md transition-shadow hover:shadow-[0_8px_24px_rgba(0,8,31,0.1)]"
            >
              <div className="flex justify-between items-start gap-2">
                {renamingId === p.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="플랜 이름"
                      className="flex-1 min-w-0 rounded-lg border border-surface-variant bg-surface px-3 py-2 text-body-md font-body-md text-primary focus:border-secondary focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => saveRename(p.id)}
                      className="shrink-0 text-label-md font-label-md text-secondary hover:text-on-secondary-container transition-colors"
                    >
                      저장
                    </button>
                  </div>
                ) : (
                  <>
                    <Link href={`/plans/${p.id}`} className="flex items-center gap-2 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-secondary-container flex items-center justify-center">
                        <span className="material-symbols-outlined icon-fill text-secondary">
                          flight
                        </span>
                      </div>
                      <h3 className="text-headline-md font-headline-md text-primary truncate">
                        {p.name || `목표 월 $${p.target_monthly_dividend}`}
                      </h3>
                    </Link>
                    <div className="flex shrink-0 gap-2 text-on-surface-variant">
                      <button
                        type="button"
                        aria-label="이름 변경"
                        onClick={() => startRename(p)}
                        className="hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                      <button
                        type="button"
                        aria-label="삭제"
                        onClick={() => deletePlan(p.id)}
                        className="hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-stack-sm flex flex-col gap-2">
                <p className="text-body-md font-body-md text-on-surface-variant">
                  목표 월 배당금: <span className="font-bold text-primary">${p.target_monthly_dividend}</span>
                </p>
                <p className="text-body-md font-body-md text-on-surface-variant">
                  월 투자금: <span className="font-bold text-primary">${p.monthly_investment}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
