import { createClient } from "@supabase/supabase-js";

/**
 * RLS를 우회하는 서비스롤 클라이언트. **서버에서만 쓴다.**
 *
 * `ticker_analysis`에는 SELECT 정책만 있고 쓰기 정책이 없어서, anon 키(`supabase.ts`)로는
 * 쓰기가 원천 차단된다. 야간 배치만 이 클라이언트로 RLS를 우회해 쓴다.
 *
 * 이 키가 브라우저에 닿으면 DB 전체가 열린다. 그래서 (1) 이름에 `NEXT_PUBLIC_`을 붙이지
 * 않아 Next가 클라이언트 번들에 넣지 않고, (2) 그래도 클라이언트 컴포넌트에서 import하면
 * 아래 가드가 즉시 터진다. 브라우저에서 DB를 읽을 땐 `supabase.ts`(anon)를 쓸 것.
 */
export function supabaseAdmin() {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin은 서버 전용이다 — 클라이언트에서는 supabase.ts를 쓸 것");
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없다");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    // 배치는 세션이 없는 일회성 실행이라 토큰을 보관·갱신할 이유가 없다.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
