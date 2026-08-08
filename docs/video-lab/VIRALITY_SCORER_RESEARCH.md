# Virality Scorer Research

## 판정

v1 scorer는 조회 수를 예측하는 ML 모델이 아니라 creative 후보를 일관되게 선별하기 위한 deterministic heuristic이다. 실제 성과 데이터가 없으므로 점수를 “viral probability”로 표현하지 않는다.

## AI Shorts Generator에서 가져온 개념

긴 영상 clipping 제품에서 유용한 개념은 후보를 여러 개 만들고 hook, 정보 밀도, 호기심, 유지 가능성으로 순위를 매기는 단계 분리다. 현재 상품 쇼츠는 long-form clipping이 아니므로 transcript chunking, source-video ingestion, 자동 게시 기능은 가져오지 않는다.

## v1 점수 구조

Positive score:

| Dimension | Weight |
|---|---:|
| Hook strength | 22% |
| Curiosity | 12% |
| Problem clarity | 14% |
| Benefit specificity | 16% |
| Purchase intent | 10% |
| Retention | 16% |
| Clarity | 10% |

Risk penalty:

| Dimension | Penalty weight |
|---|---:|
| Overclaim risk | 15% |
| Repetition risk | 10% |

Hard blockers는 빈 script/hook, disclosure 누락, 명시적 과장, 상품 무관 script, 상품명 누락, 긴 첫 문장, 중복 후보, 증거 없는 개인 사용 경험이다. blocker가 있거나 최종 점수가 55 미만이면 `passed=false`다.

## 설계 이유

- 동일 입력은 동일 결과를 내며 외부 모델/API를 호출하지 않는다.
- 각 dimension과 penalty를 함께 보존해 사람이 점수 원인을 검토할 수 있다.
- blocker는 높은 soft score로 우회할 수 없다.
- ranker는 PASS 우선, total score, 낮은 risk, hook, retention, ID 순으로 안정 정렬한다.

## 한계와 다음 연구

- 한국어 형태소 분석 없이 키워드와 문장 길이를 사용한다.
- 실제 first-2-second retention, CTR, conversion과 아직 calibration되지 않았다.
- 다음 단계는 owner가 검토한 synthetic labels와 익명화된 성과 지표를 분리 저장해 offline calibration하는 것이다.
