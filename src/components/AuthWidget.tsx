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
    const meta = session.user.user_metadata ?? {};
    const nickname = (meta.name ?? meta.full_name ?? meta.nickname) as string | undefined;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-600">{nickname ?? session.user.email}</span>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="text-slate-500 underline"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <Link href="/login" className="text-sm text-slate-700 underline">
      로그인
    </Link>
  );
}
