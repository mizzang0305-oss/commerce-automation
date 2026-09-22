import { studioAuthConfig } from "@/lib/commerce-studio/auth/config";

export const dynamic = "force-dynamic";

export default function StudioLoginPage() {
  const ready = studioAuthConfig().ready;
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#eaf1eb", color: "#14372e", fontFamily: "sans-serif", padding: 24 }}>
    <section style={{ maxWidth: 420, background: "white", borderRadius: 20, padding: 36 }}>
      <h1>Commerce Studio 소유자 로그인</h1>
      <p>Studio 운영 정보와 설정은 확인된 소유자만 사용할 수 있습니다. YouTube 게시 계정과 별도의 로그인입니다.</p>
      {ready ? <form action="/api/studio-auth/login" method="post"><button type="submit">Google 계정으로 로그인</button></form>
        : <p role="status">로그인 설정 대기: Supabase 공개 URL·키, Studio 공개 주소, Google 소유자 ID allowlist가 필요합니다.</p>}
    </section>
  </main>;
}
