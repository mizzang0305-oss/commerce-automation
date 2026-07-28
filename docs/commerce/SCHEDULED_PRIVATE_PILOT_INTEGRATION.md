---
type: architecture
project: commerce-automation
status: local_verified_no_deploy
updated: 2026-07-28
tags:
  - coupang
  - scheduler
  - python-worker
  - youtube-private
  - no-upload
---

# Scheduled Private Pilot Integration

## 목적

PR #231의 한국 일정 기반 상품 발굴 기능을 Production WebApp, Supabase repository, Python Worker, R2, UploadPackage 경로에 연결한다. PR #231의 JSONL draft queue와 local-only lifecycle은 운영 source of truth로 사용하지 않는다.

## 운영 데이터 흐름

1. KST 4개 slot runner가 overlap lock을 획득한다.
2. server-only scheduled API가 Coupang Partners 상품 검색을 1회 호출한다.
3. product ID로 원본 Coupang URL을 만들고 affiliate deeplink를 별도 검증한다.
4. `ProductCandidate`에 provider provenance를 저장한다.
5. 기존 promotion repository가 `ProductQueueItem(queue_status=scheduled)`과 `GeneratedContent`를 저장한다.
6. 기존 next-batch가 authoritative candidate ID를 signed Worker binding에 포함한다.
7. Worker가 V143 creative policy를 render 이전에 검사한다.
8. approved `local_command` MeloTTS, 한국어 정규화, faster-whisper ASR, H.264/AAC 1080x1920 검사를 통과한 결과만 R2 4개 asset으로 저장한다.
9. Worker completion API가 asset 4개와 gate 4개를 다시 확인한 뒤에만 `video_ready`를 기록한다.
10. 기존 UploadPackage 경로가 owner review용 package를 만든다.
11. owner approval API는 scheduler secret과 분리된 전용 secret으로만 승인 레코드를 생성한다. 요청 body의 `decision=PASS`는 승인 근거가 아니다. raw nonce는 응답으로 1회 전달하고 DB에는 SHA-256만 저장한다.
12. upload executor는 UploadPackage → Queue → Candidate → completed WorkerJob → QA-passed video ProductAsset을 서버에서 다시 조회하고 checksum/provider/storage binding을 검증한다.
13. Supabase RPC가 approval nonce, package, KST upload date를 원자적으로 예약하고 nonce를 소비한 뒤에만 private YouTube adapter 호출을 허용한다.
14. 외부 호출 직전 reservation을 `external_call_started`로 바꾸며, 이후 예외·응답 유실·결과 저장 실패는 자동 retry 없이 `human_review_required`로 고정한다.

## 고정 안전값

```text
SAFE_TO_UPLOAD=false
SAFE_TO_PUBLIC_UPLOAD=false
PUBLIC_UPLOAD_ENABLED=false
UNLISTED_UPLOAD_ENABLED=false
COMMENT_AUTOMATION_ENABLED=false
MAX_PRIVATE_PILOT_ITEMS=1
FAKE_SUCCESS=false
VIDEOS_INSERT_CALLED=false
R2_WRITE_PERFORMED=false
PRODUCTION_DEPLOYED=false
```

현재 코드와 환경 예시는 upload를 기본 차단한다. 스케줄러 등록 변경, Production 배포, Coupang live search, R2 write, YouTube `videos.insert`는 이 작업에서 실행하지 않았다.

## 필수 Production 설정

WebApp:

- `SCHEDULED_PRIVATE_PILOT_ENABLED`
- `SCHEDULED_PRIVATE_PILOT_API_SECRET`
- `PRIVATE_PILOT_OWNER_APPROVAL_SECRET`
- `PRIVATE_PILOT_UPLOAD_EXECUTOR_SECRET`
- `COUPANG_PARTNERS_PROVIDER_ENABLED`
- Coupang Partners server-only credentials
- `WORKER_VISUAL_BINDING_SECRET`

Worker:

- `KOREAN_VOICE_PROVIDER=local_command`
- `KOREAN_VOICE_PROVIDER_APPROVED=true`
- `KOREAN_VOICE_SPEED=1.25`
- `KOREAN_VOICE_DELIVERY_STYLE=brisk_confident_sales`
- MeloTTS local command path
- `KOREAN_ASR_PROVIDER=faster_whisper_local_command`
- `KOREAN_ASR_PROVIDER_APPROVED=true`
- faster-whisper Python executable and validator path

실제 값은 출력·문서화·commit하지 않는다.

## 실패와 복구

- provider/API 실패: 자동 retry하지 않고 다음 slot 또는 운영자 확인으로 넘긴다.
- duplicate/same-day duplicate: Queue를 만들지 않는다.
- actual usage scene evidence 부족: V143가 FFmpeg 이전에 차단한다.
- TTS/ASR/output format 실패: R2 upload 이전에 차단한다.
- Worker completion gate 실패: `video_ready`를 기록하지 않는다.
- YouTube 외부 호출 이후 실패: 자동 재업로드하지 않고 `HUMAN_REVIEW_REQUIRED`.
- reservation 실패: YouTube adapter 호출 횟수는 0이다.
- `external_call_started` 이후 실패: 같은 approval/package로 자동 재시도하지 않는다.

## 롤백

1. `SCHEDULED_PRIVATE_PILOT_ENABLED=false`로 scheduler API를 차단한다.
2. Windows Task Scheduler를 기존 runner로 되돌린다.
3. migration을 아직 적용하지 않았다면 코드 commit만 revert한다.
4. migration 적용 후에는 scheduler와 upload executor를 먼저 비활성화하고 코드 commit을 revert한다. 승인/예약 감사 테이블은 즉시 삭제하지 않고 보존한다.
5. 기존 WebApp next-batch/Python Worker 경로는 scheduled provider theme이 아닌 Queue에 대해 하위 호환을 유지한다.

## 다음 승인

첫 다음 단계는 **migration/Production no-upload 배포에 대한 별도 승인**이다. 현재 변경은 local 검증만 완료했으며 deployed no-upload API pilot은 실행하지 않았다. 이 승인은 `videos.insert`, R2 upload, YouTube private upload 승인을 포함하지 않는다.
