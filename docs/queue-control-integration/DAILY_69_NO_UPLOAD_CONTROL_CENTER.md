# Daily 69 No-Upload Control Center

## 목적

PR #238의 Local JSON Queue를 유일한 실행 권위로 유지하면서 PR #234의 Google Sheets Control Center를 읽기 projection 및 제한된 명령 bus로 연결한다. 업로드, 게시, Drive media, R2, Supabase, Production DB, Production deploy는 이 경로에 포함하지 않는다.

## 권위 경계

| 영역 | 권위 | 허용 작업 |
| --- | --- | --- |
| Queue 상태, lease, claim, complete, retry | Local JSON | Local scheduler/정적 command executor만 변경 |
| Google Sheets `상품큐` | Projection | 조회만 가능. Local 행 직접 PATCH는 `SHEETS_PROJECTION_READ_ONLY` |
| Google Sheets `명령큐` | Command bus | allowlist 명령 생성/claim/result 기록 |
| Google Sheets `실행로그` | 감사 projection | credential·URL·local path 없는 안전 요약 |
| 영상/검토 파일 | Local filesystem | `artifactReferenceId`와 안전 metadata만 Sheets에 표시 |

Sheets의 값은 Queue로 복사하지 않는다. `claim`, `lease`, `complete`는 Sheets에서 실행하지 않는다.

## Revision 계약

- `localRevision`: Local Queue 또는 설정이 실제로 바뀔 때만 단조 증가한다.
- 각 Queue 행은 `queueId`, `slotId`, `localRevision`, `updatedAt`을 가진다.
- `projectionRevision`: 마지막으로 Sheets에 완전 투영된 `localRevision`이다.
- `snapshotHash`: Queue/Reserve/안전 설정 projection의 SHA-256이다.
- `source`: 항상 `local_queue_scheduler`이다.
- 항목 변경 명령은 `expectedRevision`을 필수로 받고 불일치하면 `STALE_CONTROL_COMMAND`로 종료한다.

## 허용 명령

`PAUSE_AUTOMATION`, `RESUME_AUTOMATION`, `RUN_NIGHTLY_SCOUT`, `RUN_NEXT_BATCH`, `RETRY_SLOT`, `HOLD_SLOT`, `SKIP_SLOT`, `RELEASE_HOLD`, `REPLACE_FROM_RESERVE`, `CANCEL_COMMAND`, `REFRESH_PROJECTION`만 허용한다.

명령 상태는 `pending → claimed → completed|failed|stale_rejected`이며 대기 명령 취소는 `cancelled`다. executor는 정적 `switch`이며 shell 문자열, 업로드, 게시, 삭제, 임의 함수 호출을 허용하지 않는다. 로컬 command journal은 같은 `commandId`의 재실행을 막는다.

## Daily 69 설정

```text
dailyTargetCount=69
pilotMaxDailyItems=69
batchSize=3
startHour=1
endHour=23
reserveRatio=0.20
minimumReserveCount=14
maxRawDiscoveries=240
maxProviderCalls=30
processingDailyCap=9
minimumFreeGb=20
uploadEnabled=false
```

69개는 `slot-001`부터 `slot-069`까지 고정되며 01:00~23:00 KST에 시간당 3개로 예약한다. 후보는 product key/정규화 이름으로 중복 제거하고, 카테고리 35%, 상품군 10%, 동일 use-case 3연속 금지를 적용한다. 기준을 만족하지 못하면 Queue를 축소한 채 `DAILY_QUEUE_CAPACITY_INSUFFICIENT`로 실패하며 기준을 완화하지 않는다.

## 디스크 및 활성화 gate

- 디스크: 과거 최종 영상 크기 p95 × 69 × 2.5 + 20GB reserve 이하로 free space가 남아야 한다.
- batch p95: 3,600초 미만이어야 한다.
- canary: 별도 `daily69-canary-*` namespace에서 69 active/14 reserve를 먼저 증명한다.
- 처리 canary: 정확히 3+3+3, 총 9 logical slot만 처리한다. 이후 실행은 `DAILY_PROCESSING_CAP_REACHED` no-op이어야 한다.
- recurring 활성화: 69/14, 9/9, Sheets live, Control Center, command runner, pause/resume, projection, 중복 0, lease 0, disk, batch p95, external mutation 0이 모두 PASS일 때만 허용한다.

한 gate라도 실패하면 `enabled=false`, `isPaused=true`를 유지하고 Scout/Batch/Control task를 활성화하지 않는다.

## Google Sheets 안전

- 전용 workbook만 사용한다.
- 값 쓰기는 `valueInputOption=RAW`만 사용한다.
- Queue projection에는 원본/제휴 URL, 로컬 절대 경로, credential을 기록하지 않는다.
- 신규 보조 탭은 `예비상품`, `동기화상태`뿐이다.
- 기존 non-test 행은 synthetic smoke 중 수정하거나 삭제하지 않는다.
- Google Sheets 오류는 Local Queue 변경을 롤백하거나 손상시키지 않는다. projection은 다음 `REFRESH_PROJECTION`에서 복구한다.

## Task Scheduler

- 신규 task 이름은 `Minz-Commerce-ControlRunner-NoUpload-V1`만 허용한다.
- 1분 반복, `MultipleInstances=IgnoreNew`, `StartWhenAvailable=true`, 기본 Disabled다.
- 기존 `Minz-Commerce-Scout-NoUpload-V1`, `Minz-Commerce-VideoBatch-NoUpload-V1`은 exact action 검증 후 all-pass activation에서만 안정 runtime checkout으로 경로를 전환한다.
- 기존 `Minz-Commerce-Automation-Worker`는 변경하지 않는다.

## 롤백

1. 세 task를 Disabled로 유지한다.
2. 대상 Queue namespace의 설정을 `enabled=false`, `isPaused=true`로 기록한다.
3. 코드 롤백은 이 stacked PR의 commit을 revert한다.
4. Local JSON은 보존한다. 운영/과거 pilot namespace를 삭제하거나 덮어쓰지 않는다.
5. Sheets에서 합성 `WEB_MVP_TEST_` 행만 정리하며 non-test 행은 보존한다.
