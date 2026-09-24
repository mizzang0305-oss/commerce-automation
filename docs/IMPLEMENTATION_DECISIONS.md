# Commerce Studio 후속 구현 결정 (2026-09-23)

## 기준과 보존

- PR #264 `f08e27d3c422632d47e839c5772627fe7f84e7f6`, base `097612016fe77bb8f6deea08a09e25c855d735df`, 원본 11 Git blob 일치. Windows checkout의 세 파일은 CRLF 때문에 원시 SHA-256만 다르다.
- 개발은 별도 `codex/commerce-studio-v1` worktree에서만 한다. 운영 runtime, producer/publisher Task, 두 채널 토큰, Daily69는 건드리지 않는다.
- 기존 디자인의 녹색 사이드바·밝은 작업면·민트 강조를 유지한다. 영문 상태·장식성 문구를 줄이고 확인된 운영 상태와 오류를 우선 배치한다.

## 기존 구조 확인

| 경계 | 확인 결과 | 선택 |
| --- | --- | --- |
| 앱 Owner 로그인 | 이 `main`/PR에 없음. Vercel 배포 SSO는 별도 보호이며 앱 권한이 아님 | 기존 Supabase 의존성을 확장한 Google OIDC PKCE + 명시적 Owner allowlist. 설정 전 fail closed |
| 서버 영속 저장소 | `@supabase/supabase-js` 서비스 역할 adapter와 migration은 있으나 Studio 전용 테이블은 없음. 현재 격리 worktree에 Supabase 환경 변수 없음 | Studio 전용 migration/adapter를 작성하되 실제 DB에는 적용하지 않음. 테스트 저장소는 격리 |
| 호스트 exporter/명령 | SIMPLE Producer/Publisher의 독립 run-once 및 외부 JSON 파일은 있으나 Studio용 인증된 snapshot/command 경로 없음 | 별도 outbound exporter/command processor 계약. 기존 Task에 몰래 결합하지 않음 |
| 생성기 권위 | `FileSimpleProducerStore.mutate`가 slot claim을 파일 lock으로 직렬화. `executePipeline`에는 현재 특정 product ID 입력이 없음 | 수동 선택은 동일 claim 권위 아래서 잠금·검증 후 정확한 product ID를 pipeline에 전달. 기존 auto 경로 보존 |
| 게시기 원천 | 외부 publisher state에 job/ledger가 있고 두 채널 ID가 고정. 현재 자격증명 정상 여부는 token 경로나 과거 ledger로 증명 불가 | 읽기 요약만 export, live channel status는 별도 인증 probe 시각을 요구 |
| 후보 원천 | 운영 producer는 매 슬롯 live search. 제작 전 후보 snapshot 저장소는 확인되지 않음 | 후보 snapshot 계약을 구현. 실제 후보 수집/유료 호출은 이번 개발 테스트에서 수행하지 않음 |
| 미디어 | 로컬 MP4 경로가 publisher job에 있음. 클라우드 private media registry 없음 | 로컬 경로를 웹에 노출하지 않음. 기존 공개 YouTube 링크만 safe URL로 표시 |
| Preview | Vercel SSO 보호. 브라우저는 SSO 세션을 가질 수 있으나 Windows `D:`에 접근 못 함 | 불확실 값은 `확인 불가`. 호스트 HTTPS ingest 인증 경로 없이는 live read 성공 주장 안 함 |

## 운영 관측 기준

- 관측 시점 운영 설정은 enabled, 목표 3, 1회 최대 1, 슬롯 09:00/15:00/21:00 KST. Producer state 파일은 존재하지 않았고 publisher state는 job 1, ledger 3, READY 0이었다. 이는 본 작업의 생성/게시 결과가 아니다.
- 두 전용 Scheduled Task는 `Ready`로 조회되었다. 자연 실행은 본 작업에서 시작하거나 변경하지 않는다.
- 개발 worktree의 `SUPABASE_URL`, 서비스 키, 공개 URL/키 환경 변수는 모두 미설정으로 확인했다. 원격 Preview 설정이나 Production 상태까지 미설정이라고 추정하지 않는다.

## 상태 레이블

- 코드 작성: `IMPLEMENTED`; 격리 fixture 성공: `ISOLATED_VERIFIED`.
- 운영 파일 read-only 대조: `LIVE_READ_VERIFIED`는 해당 원천·시각에만 적용.
- 실제 config/Task/token/게시 적용은 이번 범위 밖이며 `LIVE_WRITE_VERIFIED` 사용 금지.
- 외부 앱 등록, 승인된 redirect, Owner 고유 ID allowlist, 실제 OAuth 동의가 없으면 해당 연결만 `WAITING_OWNER_ACTION`.
