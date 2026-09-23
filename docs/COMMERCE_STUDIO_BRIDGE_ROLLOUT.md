# Commerce Studio bridge 격리 구현과 적용 경계

## 이번 코드에 들어간 것

- owner Google session + 명시된 Google subject allowlist. 인증 미설정에서는 운영 파일을 읽지 않는 디자인 검토 화면.
- 독립적인 Studio snapshot/command API, HMAC host 요청, nonce 재사용 차단, source sequence/event 중복 검사.
- `commerce_studio.commerce_studio_bridge` 영속 저장용 SQL 참조 정의 및 CAS adapter. 격리 CAS 테스트에서 재시작·재전송·ACK 보존을 확인했다. Studio 전용 서버 클라이언트만 `commerce_studio` 스키마를 사용한다.
- host의 별도 `export-once.ts`와 `process-command-once.ts`. 둘 다 새 Task 등록/기존 Task 변경을 하지 않는다.
- 제품 선택은 같은 `FileSimpleProducerStore.mutate` lock에서 producer claim과 직렬화하고, 선택한 canonical ID를 실제 child input까지 전달한다.
- 웹에서 명령은 `pending`과 host `applied`를 구분한다. source가 오래되면 관측/수신/조회 시각을 분리해 지연 표시한다.

## 아직 적용되지 않은 것

- `MINZ CASHFLOW COMMERCE` (`uzrancqshgtzwahdficm`)에 전용 스키마 migration `20260922225851_create_commerce_studio_isolated_bridge_schema`가 별도로 적용됐다. 이 저장소의 `011_commerce_studio_bridge.sql`은 새 환경용 참조 정의이며 해당 프로젝트에 재실행하지 않는다. Preview/Production 영속 store 환경은 아직 연결하지 않았다.
- 운영 host HMAC 자격정보·outbound 접근 경로·새 exporter/processor Task를 설치하지 않았다. 기존 producer/publisher Task는 변경하지 않았다.
- 실제 상품 후보를 제작 전에 생성하는 bounded host scout는 아직 없다. 테스트 후보는 fixture이다.
- host settings Task schedule adapter는 아직 연결되지 않았다. 설정 UI의 요청 코드가 있더라도 config/Task 동시 ACK를 실운영에서 증명하지 못했다.
- OAuth 계정 연결/재연결, private media proxy, Production write는 구현·적용되지 않았다.
- `STUDIO_COMMANDS_ENABLED`와 `STUDIO_HOST_COMMANDS_ENABLED`는 별도 gate다. 둘 다 설정 전에는 운영 명령을 적용하지 않는다.

## 환경 변수 이름만 기록 (값 금지)

서버: `COMMERCE_STUDIO_ENABLED`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `STUDIO_PUBLIC_ORIGIN`, `STUDIO_GOOGLE_SUB_ALLOWLIST`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STUDIO_ENVIRONMENT_ID`, `STUDIO_OWNER_GOOGLE_SUB`, `STUDIO_HOST_ID`, `STUDIO_HOST_HMAC_SECRET`, `STUDIO_EXPECTED_RUNTIME_SHA`, `STUDIO_COMMANDS_ENABLED`.

호스트: `STUDIO_BRIDGE_ORIGIN`, `STUDIO_ENVIRONMENT_ID`, `STUDIO_OWNER_GOOGLE_SUB`, `STUDIO_HOST_ID`, `STUDIO_HOST_HMAC_SECRET`, `STUDIO_RUNTIME_SHA`, `STUDIO_HOST_SEQUENCE_PATH`, `YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH`, `SIMPLE_PRODUCER_CONFIG_PATH`, `STUDIO_HOST_COMMANDS_ENABLED`.

서버와 호스트는 서로 다른 환경/credential/namespace를 사용해 Preview→Production 명령 교차를 막아야 한다. 추가 DB 변경, 자격정보 사용, Task 설치, Production 쓰기는 별도 Owner 승인과 롤백 계획이 필요하다.

## 전용 스키마 적용 후 연결 경계

- 2026-09-23 읽기 전용 확인: 지정 프로젝트의 migration 이력과 `commerce_studio.commerce_studio_bridge`(저장 행 0)를 확인했다. 함수는 `SECURITY INVOKER`, 빈 `search_path`이며 테이블은 RLS ENABLE/FORCE 상태다. `anon`/`authenticated`의 스키마 USAGE는 없고 `service_role`은 스키마 USAGE 및 테이블 SELECT/INSERT/UPDATE를 갖지만 DELETE는 없다.
- Owner의 Drive 인수인계 ZIP `commerce-studio-schema-separation.zip`(SHA-256 `6952CF51F07322C0D16E5962080A2DBB433BA13C2D4B048C5A75AB05622BF14E`)은 manifest 5/5가 일치했다. 그 안의 `01_applied_migration.sql`은 이미 적용된 DB 이력의 참고 증거다. 저장소의 `011`은 새 환경용 참조 migration이며 동일 프로젝트에 재적용하지 않는다. 실수로 재실행해도 기존 스키마에서 실패하도록 `CREATE SCHEMA`를 비멱등으로 두고, 기존 CAS 함수를 `CREATE OR REPLACE`로 덮어쓰지 않는다.
- `serverStore.ts`의 전용 Supabase 클라이언트에만 `db: { schema: "commerce_studio" }`를 지정했다. 다른 서비스의 기본 `public` 스키마와 공용 클라이언트는 변경하지 않았다. 가짜 HTTP 응답을 사용한 테스트는 읽기 요청의 `Accept-Profile`과 CAS RPC의 `Content-Profile`이 모두 `commerce_studio`인지 확인한다.
- 2026-09-23 별도 Owner 승인으로 Data API Exposed schemas에 기존 `graphql_public`, `public`을 보존하고 `commerce_studio`만 추가했다. 공식 Dashboard 재조회는 3/5 선택을 확인했다. 서버 자격의 실제 REST GET은 HTTP 200/빈 배열, 유효한 publishable 자격의 동일 요청은 HTTP 401/`42501` permission denied였다. 이는 REST 경로 검증이지 snapshot 동기화나 Preview 앱 연결 완료가 아니다. `anon`/`authenticated`에 USAGE나 테이블·함수 권한을 부여하거나 allow-all RLS 정책을 추가하지 않는다.
- 기존 프로젝트의 Auth, 키, Storage, Vercel, 운영 Task/토큰/Sheets/operation은 이 코드 변경으로 수정하지 않는다. `service_role`은 RLS를 우회할 수 있으므로 owner/environment/host 검사는 반드시 서버에서 유지한다.

## 롤백

코드/Preview만 되돌릴 때 Studio feature flag를 끄거나 Studio commit을 revert한다. 기존 게시기, 원장, token, Daily69를 되돌리거나 삭제하지 않는다. 아직 운영 DB/Task를 바꾸지 않았으므로 이번 변경의 운영 데이터 down-migration은 없다.
