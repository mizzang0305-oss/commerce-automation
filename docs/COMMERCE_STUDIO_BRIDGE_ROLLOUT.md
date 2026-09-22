# Commerce Studio bridge 격리 구현과 적용 경계

## 이번 코드에 들어간 것

- owner Google session + 명시된 Google subject allowlist. 인증 미설정에서는 운영 파일을 읽지 않는 디자인 검토 화면.
- 독립적인 Studio snapshot/command API, HMAC host 요청, nonce 재사용 차단, source sequence/event 중복 검사.
- `commerce_studio_bridge` 영속 저장용 SQL migration 및 CAS adapter. 격리 CAS 테스트에서 재시작·재전송·ACK 보존을 확인했다.
- host의 별도 `export-once.ts`와 `process-command-once.ts`. 둘 다 새 Task 등록/기존 Task 변경을 하지 않는다.
- 제품 선택은 같은 `FileSimpleProducerStore.mutate` lock에서 producer claim과 직렬화하고, 선택한 canonical ID를 실제 child input까지 전달한다.
- 웹에서 명령은 `pending`과 host `applied`를 구분한다. source가 오래되면 관측/수신/조회 시각을 분리해 지연 표시한다.

## 아직 적용되지 않은 것

- SQL migration을 실제 Supabase DB에 적용하지 않았다. Preview/Production 영속 store 환경도 연결하지 않았다.
- 운영 host HMAC 자격정보·outbound 접근 경로·새 exporter/processor Task를 설치하지 않았다. 기존 producer/publisher Task는 변경하지 않았다.
- 실제 상품 후보를 제작 전에 생성하는 bounded host scout는 아직 없다. 테스트 후보는 fixture이다.
- host settings Task schedule adapter는 아직 연결되지 않았다. 설정 UI의 요청 코드가 있더라도 config/Task 동시 ACK를 실운영에서 증명하지 못했다.
- OAuth 계정 연결/재연결, private media proxy, Production write는 구현·적용되지 않았다.
- `STUDIO_COMMANDS_ENABLED`와 `STUDIO_HOST_COMMANDS_ENABLED`는 별도 gate다. 둘 다 설정 전에는 운영 명령을 적용하지 않는다.

## 환경 변수 이름만 기록 (값 금지)

서버: `COMMERCE_STUDIO_ENABLED`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `STUDIO_PUBLIC_ORIGIN`, `STUDIO_GOOGLE_SUB_ALLOWLIST`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STUDIO_ENVIRONMENT_ID`, `STUDIO_OWNER_GOOGLE_SUB`, `STUDIO_HOST_ID`, `STUDIO_HOST_HMAC_SECRET`, `STUDIO_EXPECTED_RUNTIME_SHA`, `STUDIO_COMMANDS_ENABLED`.

호스트: `STUDIO_BRIDGE_ORIGIN`, `STUDIO_ENVIRONMENT_ID`, `STUDIO_OWNER_GOOGLE_SUB`, `STUDIO_HOST_ID`, `STUDIO_HOST_HMAC_SECRET`, `STUDIO_RUNTIME_SHA`, `STUDIO_HOST_SEQUENCE_PATH`, `YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH`, `SIMPLE_PRODUCER_CONFIG_PATH`, `STUDIO_HOST_COMMANDS_ENABLED`.

서버와 호스트는 서로 다른 환경/credential/namespace를 사용해 Preview→Production 명령 교차를 막아야 한다. 실제 DB migration, 자격정보 사용, Task 설치, Production 쓰기는 별도 Owner 승인과 롤백 계획이 필요하다.

## 롤백

코드/Preview만 되돌릴 때 Studio feature flag를 끄거나 Studio commit을 revert한다. 기존 게시기, 원장, token, Daily69를 되돌리거나 삭제하지 않는다. 아직 운영 DB/Task를 바꾸지 않았으므로 이번 변경의 운영 데이터 down-migration은 없다.
