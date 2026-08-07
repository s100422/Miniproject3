"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { data: nickname ? { nickname } : undefined },
    });
    setLoading(false);
    if (error) {
      setError("인증코드 전송에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    setStep("code");
  }

  async function verifyCode() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setLoading(false);
    if (error) {
      setError("인증코드가 올바르지 않거나 만료됐어요.");
      return;
    }
    router.push("/");
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">로그인</h1>
      <p className="mt-2 text-sm text-slate-600">
        이메일로 받은 인증코드로 로그인해요. 처음이시면 닉네임도 알려주세요.
      </p>

      {step === "email" && (
        <div className="mt-6 space-y-3">
          <label className="block text-sm text-slate-700">
            이메일
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-sm text-slate-700">
            닉네임 (처음 가입 시에만 필요해요)
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              placeholder="여행러버"
            />
          </label>
          <button
            type="button"
            disabled={!email || loading}
            onClick={sendCode}
            className="w-full rounded bg-emerald-700 py-2 text-white disabled:bg-slate-300"
          >
            {loading ? "전송 중..." : "인증코드 받기"}
          </button>
        </div>
      )}

      {step === "code" && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-600">{email}로 보낸 6자리 코드를 입력하세요.</p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="123456"
          />
          <button
            type="button"
            disabled={!code || loading}
            onClick={verifyCode}
            className="w-full rounded bg-emerald-700 py-2 text-white disabled:bg-slate-300"
          >
            {loading ? "확인 중..." : "확인"}
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}
