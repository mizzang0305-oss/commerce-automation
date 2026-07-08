# V103 Event Based Candidate Scout 30D No Upload

## 목적

V102 first-video settings preflight가 `BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD`에서 멈추지 않도록, 사람이 1번 후보를 직접 고르기 전에 날짜/시즌/행사 기반 후보를 자동 생성한다.

이 기능은 업로드 실행기가 아니다. 현재 범위는 dry-run 후보 생성과 V102 memory fixture 연결까지다.

## 범위

- 기준일: 기본 system date, 테스트/운영 dry-run에서는 `V103_SCOUT_TODAY`로 주입 가능
- scout window: `today`부터 `today + 30 days`
- 채널: `father_jobs`, `neoman_moleulgeol`, `lets_buy`
- 후보 상태: memory fixture의 `manual_review` / `not_ready`
- queue write: 없음
- DB write: 없음
- n8n webhook: 없음
- upload/comment/scheduler 실행: 없음

## 이벤트 seed

한국 기준 2026년 여름 운영에 필요한 기본 seed를 코드 config로 관리한다.

- 초복
- 중복
- 말복 사전 준비
- 폭염
- 열대야
- 장마 끝물
- 여름휴가
- 캠핑/펜션/계곡
- 여름방학
- 제헌절
- 광복절 사전 준비

복날 날짜는 config에 둔다. 해당 연도 config가 없으면 후속 작업에서 `삼복 시즌` generic event fallback을 추가할 수 있다.

## scoring 기준

각 후보는 아래 항목을 기반으로 score를 계산한다.

- 날짜 임박성
- 식품 전환 적합도
- 계절성
- 쇼츠 소재 적합도
- 채널 적합도
- 재고/상품 매칭 가능성
- 반복 가능성

우선순위는 복날/삼복, 폭염/열대야, 휴가/캠핑/계곡, 방학 간식이 제헌절보다 높다. 광복절은 실제일이 30일 창 밖이면 직접 이벤트가 아니라 `광복절 사전 준비` 후보로만 낮은 점수를 받는다.

## V102 연결

V103 dry-run은 selected first candidate를 `ProductQueueItem` memory fixture로 변환해 V102 preflight에 주입한다.

기대 결과:

- `selectedItemFound=true`
- 기존 `BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD`를 벗어남
- 실제 upload package / prepared HTTPS asset이 없으면 다음 blocker는 정상적으로 `BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD` 또는 `BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD`

이 상태는 성공이다. 목표는 “후보 없음”이 아니라 “설정 체크로 진입”하는 것이다.

## 명령

```powershell
npm run automation:v103:event-candidate-scout --silent
```

테스트 기준일 예:

```powershell
$env:V103_SCOUT_TODAY="2026-07-09"
npm run automation:v103:event-candidate-scout --silent
```

## 안전 경계

- `videos.insert=0`
- `commentThreads.insert=false`
- public/unlisted/private upload 실행 금지
- comment automation 금지
- scheduler execution 금지
- n8n webhook 호출 금지
- R2/DB/product_assets/storage write 금지
- Supabase migration apply 금지
- raw affiliate URL / raw Coupang URL / raw URL / full ID / token / secret / Auth / HMAC 출력 금지
- fake success 금지
- `SAFE_TO_UPLOAD=false`
- `SAFE_TO_PUBLIC_UPLOAD=false`

## 다음 작업

1. PR review/merge 후 main에서 V103 dry-run을 재실행한다.
2. V103 selected first candidate를 실제 queue 생성으로 승격하려면 별도 owner approval과 DB write 설계가 필요하다.
3. upload package와 prepared asset evidence가 준비되기 전까지 업로드 논의로 이동하지 않는다.
