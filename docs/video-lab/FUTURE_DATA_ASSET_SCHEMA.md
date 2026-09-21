# Future Video Lab Data Asset Schema

지금 DB를 만들거나 migration을 적용하지 않는다. 아래는 local/offline dataset contract 초안이다.

## Entities

### creative_candidate

- `candidate_id` (pseudonymous, stable)
- `product_key_hash` (raw product URL/ID 금지)
- `script_hash`, `hook_hash`
- scorer version (`video-lab-creative-score-v2`)과 dimension scores
- blockers, owner label, created_at

### render_observation

- `candidate_id`, renderer version
- output profile, duration, caption/ASR/visual QA summaries
- local artifact digest만 저장; absolute path와 URL 금지

### performance_observation

- `candidate_id`, channel cohort, observation window
- impressions, view/retention buckets, click/conversion buckets
- raw viewer/customer identifiers 금지

### training_example

- input feature version
- label provenance (`owner_review` 또는 `sanitized_performance`)
- train/validation/test split key
- leakage audit result

## Lifecycle

```text
Candidate -> Score -> Owner label -> Optional render QA
          -> Sanitized performance -> Offline calibration dataset
          -> Versioned scorer comparison
```

## Guardrails

- Production data export는 별도 승인 대상이다.
- URL, token, credential, full external ID, customer data를 저장하지 않는다.
- scorer version과 label provenance가 없으면 학습 데이터로 사용할 수 없다.
- `canonical_product_name`과 approved alias provenance를 분리 보존하고 raw Coupang title 전체 일치를 identity ground truth로 사용하지 않는다.
- temporal holdout과 product-level split으로 leakage를 차단한다.
