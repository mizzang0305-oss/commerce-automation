# Live Coupang Product to Autonomous Video V1

## 목적

검증된 Product-to-Video V2 앞에 실제 Coupang Partners 상품 검색을 연결한다. 이 경로는 상품을 읽고 로컬 MP4와 검증 artifact를 생성하지만 Queue, DB, Sheets, Drive, R2, Worker, Scheduler, 플랫폼 업로드는 호출하지 않는다.

## 데이터 흐름

1. 기존 rolling 30-day KST event calendar와 keyword planner에서 최대 5개 query를 만든다.
2. 기존 signed Coupang Partners search request와 deeplink client를 통해 keyword당 최대 6개, 전체 최대 30개 후보를 읽는다.
3. 후보를 deterministic product identity로 normalize하고 기존 event-aware score를 재사용한다.
4. policy, affiliate, image, duplicate, motion suitability, owner-reviewed generic-use evidence를 fail closed로 평가한다.
5. 차량/책상/세탁 use-case별 후보 1개를 선택한다. slot당 후보 시도는 최대 3개다.
6. 실제 Coupang 이미지는 `product_reference`, V049 owner-reviewed 장면은 `generic_usage_example`로 분리한다.
7. `LiveProductToVideoInputAdapter`가 기존 `ProductVideoAutomationInput`을 만들고 Virality Scorer V2, MeloTTS, faster-whisper, WhisperX, POP_GROUP, FFmpeg V2, autonomous QA를 그대로 실행한다.
8. Codex가 first frame, first-3-seconds contact sheet, full contact sheet를 로컬에서 직접 검사한 뒤 finalizer를 실행한다.

## 실행

환경변수 값은 server/local-only로 주입하고 출력하지 않는다. configured boolean만 로그에 남는다.

```powershell
npm run live-product-video:e2e
npm run live-product-video:finalize -- --run <live-run-root> --notes <codex-local-notes.json>
```

산출물은 ignored `data/live-product-video/**`와 `data/video-automation/**`에만 생성한다. MP4/WAV/JPG/PNG는 commit하지 않는다.

## Provenance와 표현 정책

- `sourceProvider`, safe `sourceRequestId`, `discoveredAt`, `sourceKeyword`, `rawProductId`, `productKey`를 creative/render/final summary까지 보존한다.
- actual Coupang 상품 이미지는 `상품 참고 이미지`로 표시한다.
- generic 사용 장면은 첫 진입 시 `연출된 사용 예시`, 이후 `사용 예시`로 표시한다.
- `exactProductUse=false`, `overclaim=false`를 유지한다.
- affiliate 상품은 쿠팡파트너스 disclosure가 없으면 V2 input validation에서 차단한다.

## 고정 안전값

`SAFE_TO_UPLOAD=false`, `SAFE_TO_PUBLIC_UPLOAD=false`, `DB_WRITE=0`, `QUEUE_WRITE=0`, `SHEETS_WRITE=0`, `DRIVE_WRITE=0`, `R2_WRITE=0`, `PRODUCTION_DEPLOY=0`, `WORKER_CHANGE=0`, `SCHEDULER_CHANGE=0`, `PLATFORM_UPLOAD=0`.
