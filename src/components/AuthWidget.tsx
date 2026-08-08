"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export default function AuthWidget() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session) {
    return (
      <div className="flex items-center gap-stack-md">
        <span className="hidden text-label-md font-label-md text-on-surface-variant sm:block">
          {session.user.email}
        </span>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="rounded-full p-2 text-primary transition-colors hover:bg-surface-container-low hover:text-secondary"
          aria-label="로그아웃"
          title="로그아웃"
        >
          <span className="material-symbols-outlined icon-fill text-3xl">
            account_circle
          </span>
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="rounded-full p-2 text-primary transition-colors hover:bg-surface-container-low hover:text-secondary"
      aria-label="로그인"
      title="로그인"
    >
      <span className="material-symbols-outlined text-3xl">account_circle</span>
    </Link>
  );
}
