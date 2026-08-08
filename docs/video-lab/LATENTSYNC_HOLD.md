# LatentSync Decision

Status: `HOLD_AI_PRESENTER_PHASE`.

현재 상품 쇼츠의 우선순위는 script selection, 실제 사용 장면, 한국어 TTS, caption alignment, render QA다. Lip-sync/AI presenter는 GPU·모델·초상권·consent·identity provenance·render 비용을 추가하고 기존 품질 blocker를 해결하지 않는다.

재검토 조건:

- owner가 AI presenter use case를 승인한다.
- 출연자 consent와 identity provenance 정책이 정의된다.
- disposable GPU environment와 라이선스 검토가 완료된다.
- 기존 no-upload QA를 그대로 통과하는 A/B protocol이 있다.

이번 단계에는 dependency, model, sample media, adapter를 추가하지 않는다.
