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
11. private pilot gate는 fresh approval, 1일 1개, 중복 없음, private visibility를 모두 만족할 때만 YouTube adapter를 1회 호출한다.

## 고정 안전값

```text
SAFE_TO_UPLOAD=false
SAFE_TO_PUBLIC_UPLOAD=false
PUBLIC_UPLOAD_ENABLED=false
UNLISTED_UPLOAD_ENABLED=false
COMMENT_AUTOMATION_ENABLED=false
MAX_PRIVATE_PILOT_ITEMS=1
FAKE_SUCCESS=false
```

현재 코드와 환경 예시는 upload를 기본 차단한다. 스케줄러 등록 변경, Production 배포, Coupang live search, R2 write, YouTube `videos.insert`는 이 작업에서 실행하지 않았다.

## 필수 Production 설정

WebApp:

- `SCHEDULED_PRIVATE_PILOT_ENABLED`
- `SCHEDULED_PRIVATE_PILOT_API_SECRET`
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

## 롤백

1. `SCHEDULED_PRIVATE_PILOT_ENABLED=false`로 scheduler API를 차단한다.
2. Windows Task Scheduler를 기존 runner로 되돌린다.
3. 이 변경 파일을 revert한다.
4. 기존 WebApp next-batch/Python Worker 경로는 scheduled provider theme이 아닌 Queue에 대해 하위 호환을 유지한다.

## 다음 승인

첫 다음 단계는 commit/push가 아니라 **Production no-upload 배포와 1회 scheduled API pilot 승인**이다. 이 승인은 `videos.insert`, R2 upload, YouTube private upload 승인을 포함하지 않는다.
