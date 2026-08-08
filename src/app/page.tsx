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
    <main className="mx-auto flex w-full max-w-[800px] flex-grow flex-col items-center justify-center px-container-margin py-section-gap pb-32 md:pb-section-gap">
      <div className="mb-section-gap text-center">
        <div className="mb-stack-lg inline-flex items-center justify-center rounded-full bg-primary-fixed p-4 shadow-sm">
          <span className="material-symbols-outlined text-4xl text-primary">savings</span>
        </div>
        <h2 className="mb-stack-sm text-headline-lg-mobile font-headline-lg-mobile leading-tight tracking-tight text-primary md:text-headline-lg md:font-headline-lg">
          배당주 투자에 대해
          <br />
          들어보셨나요?
        </h2>
        <p className="mx-auto mt-stack-md max-w-md text-body-lg font-body-lg text-on-surface-variant">
          당신의 여행 자금을 만들어줄 배당 성장의 마법,
          <br />
          지금 바로 시작해보세요.
        </p>
      </div>

      <div className="flex w-full max-w-2xl flex-col gap-stack-lg md:flex-row">
        <Link
          href="/about"
          className="group flex flex-1 items-center justify-between rounded-2xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_12px_rgba(0,8,31,0.05)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,8,31,0.1)]"
        >
          <div className="flex items-center gap-stack-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container transition-colors group-hover:bg-surface-container-high">
              <span className="material-symbols-outlined text-on-surface-variant">school</span>
            </div>
            <span className="text-body-lg font-body-lg font-medium text-primary">
              아니요, 자세히 알려주세요
            </span>
          </div>
          <span className="material-symbols-outlined text-outline-variant transition-colors group-hover:text-primary">
            chevron_right
          </span>
        </Link>

        <Link
          href="/plan"
          className="group relative flex flex-1 items-center justify-between overflow-hidden rounded-2xl border border-secondary-fixed bg-secondary-container p-6 shadow-[0_4px_12px_rgba(36,105,92,0.15)] transition-all duration-300 hover:-translate-y-1 hover:bg-secondary-fixed hover:shadow-[0_8px_24px_rgba(36,105,92,0.25)]"
        >
          <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-white opacity-20 blur-xl transition-transform duration-500 group-hover:scale-150" />
          <div className="relative z-10 flex items-center gap-stack-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-on-secondary-container text-secondary-container shadow-sm transition-transform duration-300 group-hover:scale-110">
              <span className="material-symbols-outlined icon-fill">rocket_launch</span>
            </div>
            <span className="text-body-lg font-body-lg font-bold text-on-secondary-container">
              네, 바로 플랜 짜주세요
            </span>
          </div>
          <span className="material-symbols-outlined relative z-10 text-on-secondary-container transition-transform group-hover:translate-x-1">
            arrow_forward
          </span>
        </Link>
      </div>
    </main>
  );
}
