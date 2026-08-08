"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "sent">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logIn() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("이메일 또는 비밀번호가 올바르지 않아요.");
      return;
    }
    router.push("/");
  }

  async function signUp() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setLoading(false);
    if (error) {
      setError("회원가입에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    setMode("sent");
  }

  const inputClass =
    "block w-full rounded-lg border border-outline-variant bg-surface py-3 pl-10 pr-3 font-body-md text-body-md text-on-surface outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary";

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface p-container-margin">
      <main className="relative w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface-container-lowest shadow-[0_4px_12px_rgba(0,8,31,0.05)]">
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 -translate-y-1/2 translate-x-1/2 rounded-full bg-secondary-container blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-40 w-40 -translate-x-1/2 translate-y-1/2 rounded-full bg-secondary-container/40 blur-3xl" />

        <div className="relative z-10 p-stack-lg">
          <header className="mb-section-gap text-center">
            <div className="mx-auto mb-stack-md h-96 w-96 overflow-hidden rounded-xl">
              <Image
                src="/logo.jpg"
                alt="배당 모아 해외여행!"
                width={384}
                height={384}
                className="h-full w-full object-cover"
              />
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              안전하고 간편하게 시작하세요.
            </p>
          </header>

          {mode !== "sent" && (
            <div className="mb-stack-lg flex justify-center gap-stack-md">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`font-label-md text-label-md ${mode === "login" ? "text-primary" : "text-on-surface-variant"}`}
              >
                로그인
              </button>
              <span className="text-on-surface-variant">|</span>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`font-label-md text-label-md ${mode === "signup" ? "text-primary" : "text-on-surface-variant"}`}
              >
                회원가입
              </button>
            </div>
          )}

          {(mode === "login" || mode === "signup") && (
            <div className="space-y-stack-md">
              <div>
                <label
                  className="mb-stack-sm block font-label-md text-label-md text-on-surface"
                  htmlFor="email"
                >
                  이메일 주소
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="material-symbols-outlined text-outline-variant">mail</span>
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label
                  className="mb-stack-sm block font-label-md text-label-md text-on-surface"
                  htmlFor="password"
                >
                  비밀번호
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="material-symbols-outlined text-outline-variant">lock</span>
                  </span>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="********"
                    minLength={6}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="pt-stack-md">
                <button
                  type="button"
                  disabled={!email || !password || loading}
                  onClick={mode === "login" ? logIn : signUp}
                  className="w-full rounded-2xl bg-primary py-3 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-container active:scale-[0.98] disabled:bg-surface-variant disabled:text-on-surface-variant"
                >
                  {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
                </button>
              </div>
            </div>
          )}

          {mode === "sent" && (
            <div className="space-y-stack-md text-center">
              <p className="font-body-md text-body-md text-on-surface-variant">
                {email}로 인증 메일을 보냈어요. 메일함에서 링크를 눌러 인증을 완료해주세요.
              </p>
              <button
                type="button"
                onClick={() => setMode("login")}
                className="font-label-md text-label-md text-secondary transition-colors hover:text-on-secondary-container"
              >
                로그인으로 돌아가기
              </button>
            </div>
          )}

          {error && (
            <p className="mt-gutter rounded-lg bg-error-container px-3 py-base font-body-md text-body-md text-error">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
