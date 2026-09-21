# Google Sheets Web Control Center MVP

> Daily 69 통합 모드에서는 이 문서의 standalone Sheets-authoritative Queue가 적용되지 않는다. 통합 계약은 `docs/queue-control-integration/DAILY_69_NO_UPLOAD_CONTROL_CENTER.md`가 우선하며, Local JSON만 실행 권위이고 Sheets는 projection/command bus다. 기존 Drive preview/manual-upload 기록 경로는 legacy UI 호환용이며 Daily 69 executor에서는 호출되지 않는다.

## 목적

Google Sheets를 운영 source of truth로 유지하면서 Next.js 운영 화면과 Windows 로컬 명령 runner를 연결한다. 이 MVP는 자동 업로드를 포함하지 않는다.

```text
Browser -> authenticated Next.js server API -> Google Sheets
Windows runner -> 명령큐 claim -> allowlisted local action -> 상품큐/실행로그 update
                                              -> Google Drive video folder
```

## 페이지

- `/commerce-control`: 운영 지표, 최근 명령/오류, 빠른 명령
- `/commerce-control/queue`: 검색, 날짜/시간대/상태/품질/업로드 필터, 카드/표 보기
- `/commerce-control/queue/[queueId]`: 상품 수정, Drive preview, 검토/재시도/수동 업로드 완료 명령, 이력
- `/commerce-control/commands`: 취소 및 실패 명령 1회 재시도
- `/commerce-control/logs`: 안전 메시지, 전/후 상태, 외부 호출 여부
- `/commerce-control/settings`: 허용된 운영 설정 수정. 업로드 관련 안전값은 잠금

## server-only 환경변수

실제 값은 저장소에 기록하지 않는다. 이름과 예시는 `.env.example`을 사용한다.

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_DRIVE_VIDEO_FOLDER_ID`
- `COMMERCE_CONTROL_PASSWORD`
- `COMMERCE_CONTROL_SESSION_SECRET`
- `COMMAND_RUNNER_ID`
- `COMMAND_RUNNER_POLL_SECONDS`

Service Account에는 대상 Spreadsheet와 전용 Drive 폴더만 공유한다. 앱은 Sheets scope와 `drive.file` scope만 요청하며 credential 값을 응답이나 로그에 넣지 않는다.

## 명령 처리 경계

- `보류`, `제외`, `검토PASS`, `검토FAIL`, 허용된 상품 필드 수정, 유효한 YouTube URL의 `수동업로드완료`는 Sheet 상태만 수정한다.
- `오늘상품찾기`, `영상재생성`, `음성재생성`, `전체재시도`, 별도 열이 필요한 콘텐츠 메타데이터는 allowlisted executor가 연결되기 전 `사람확인필요`가 된다.
- 기본 executor는 실제 discovery/render/TTS/ASR/Drive 호출을 하지 않으며 성공을 가장하지 않는다.
- runner는 `commerce-assets/sheets-runner/runner.lock`으로 동일 PC의 중복 실행을 막고, 한 번에 가장 오래된 대기 명령 하나만 처리한다.
- Task Scheduler 설치 스크립트는 현재 설치하지 않고 `TASK_SCHEDULER_INSTALL_NOT_APPROVED`만 출력한다.

## 실행

```powershell
npm run automation:sheets-command-runner -- --once
.\scripts\automation\run-google-sheets-command-runner.ps1 -Once
```

지속 polling 또는 Task Scheduler 설치는 별도 승인과 credential smoke 이후 진행한다.

## 안전값

```text
SAFE_TO_UPLOAD=false
SAFE_TO_PUBLIC_UPLOAD=false
YOUTUBE_AUTO_UPLOAD=false
PUBLIC_UPLOAD=false
UNLISTED_UPLOAD=false
COMMENT_AUTOMATION=false
SUPABASE_REQUIRED=false
DOCKER_REQUIRED=false
SVM_REQUIRED=false
```

웹 설정에서도 `업로드 방식=수동`, `비공개 자동 업로드=FALSE`, `공개 자동 업로드=FALSE` 외의 값은 차단한다.

## 실제 연결 전 확인

현재 Spreadsheet의 탭/헤더/timezone은 읽기 전용으로 확인했다. 실제 credential 연결 smoke 전에 다음을 별도 승인 범위에서 확인한다.

1. Service Account에 Spreadsheet와 전용 Drive 폴더만 공유
2. `명령큐` 명령 validation에 `오늘상품찾기`, `명령취소` 포함
3. `명령큐` 상태 validation에 `취소` 포함
4. `WEB_MVP_TEST_` synthetic 행 read/write/delete 후 기존 운영 행 불변 확인
5. 실제 local executor 연결은 명령별 입력/출력 계약과 no-upload 검증 후 별도 진행

## 롤백

코드 롤백은 이 기능 commit을 revert한다. 외부 scheduler와 Production 배포가 없으므로 이번 Draft 단계의 외부 롤백은 없다. 실제 Sheet smoke에서는 `WEB_MVP_TEST_` 행만 삭제한다.
