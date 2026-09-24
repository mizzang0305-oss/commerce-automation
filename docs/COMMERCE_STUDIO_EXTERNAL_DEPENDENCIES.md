# Commerce Studio 외부 연결 의존성 (2026-09-23)

이 문서는 실제 앱 등록·동의·토큰 적용이 완료됐다는 보고가 아니다. 플랫폼 승인 전에는 연결 상태를 `미확인`으로 유지하고 자동 게시 스위치를 켜지 않는다.

| 연결 | 확인한 공식 계약 | 이번 구현 상태 | 소유자/운영자 후속 조치 |
| --- | --- | --- | --- |
| 앱 소유자 로그인 | [Supabase Next.js 서버 클라이언트](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs&package-manager=npm&queryGroups=framework&queryGroups=package-manager), [Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google) | 서버 검증·Google sub allowlist 코드와 비인가 401 검증. 실제 동의 미검증 | 별도 Supabase 프로젝트/Google provider, 고정 Preview origin, 검증된 owner sub·email 설정 |
| YouTube | [channels.list(mine=true)](https://developers.google.com/youtube/v3/docs/channels/list), [웹 서버 OAuth scope](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps) | 기존 두 토큰·게시기를 변경하지 않음. 과거 게시와 현재 인증을 분리 표시. 새 웹 재연결은 미구현 | 기존 host의 channel-specific token을 그대로 보존. 별도 재연결 설계·승인 필요 |
| Instagram | [Meta가 제공하는 Instagram Login API 컬렉션](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login) | 앱/redirect/권한 미확인으로 연결하지 않음. Meta 공식 개발 문서 직접 조회는 429로 막혀 scope·token 수명을 확정하지 않음 | Meta 앱 등록과 공식 문서/권한 재확인, 전문 계정 동의. Facebook Login 경로와 혼합 금지 |
| TikTok | [Login Kit Web](https://developers.tiktok.com/docs/en/login-kit-web), [Get User Info](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info) | `user.info.basic` 연결과 게시 권한을 분리. 실제 앱 등록/redirect/동의 전 연결하지 않음 | client key/secret, 고정 HTTPS redirect 등록, owner 동의, 사용자 ID readback |

공식 TikTok 웹 문서는 HTTPS 고정 redirect 및 anti-forgery `state`를 요구한다. 따라서 매 PR의 가변 Preview URL을 등록된 redirect로 가정하지 않는다. 이 문서만으로 OAuth 실제 연결을 완료 처리하지 않는다.
