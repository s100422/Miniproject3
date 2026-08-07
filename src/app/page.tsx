"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  if (checking) return null;

  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">배당주 투자에 대해 들어보셨나요?</h1>

      <div className="mt-8 space-y-4">
        <Link
          href="/about"
          className="block rounded-lg border border-amber-300 bg-amber-50 px-6 py-4 text-left hover:border-amber-500"
        >
          <p className="text-lg font-semibold text-slate-900">아니요. 자세히 알려주세요.</p>
          <p className="mt-1 text-sm text-slate-600">배당주 투자란? 자세히 보기</p>
        </Link>

        <Link
          href="/plan"
          className="block rounded-lg border border-amber-300 bg-amber-50 px-6 py-4 text-left hover:border-amber-500"
        >
          <p className="text-lg font-semibold text-slate-900">네. 바로 배당주 투자 플랜 짜주세요.</p>
        </Link>
      </div>
    </main>
  );
}
