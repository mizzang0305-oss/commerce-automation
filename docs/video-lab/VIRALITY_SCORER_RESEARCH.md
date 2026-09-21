# Virality Scorer Research

## 판정

v2 scorer는 조회 수를 예측하는 ML 모델이 아니라 creative 후보를 일관되게 선별하기 위한 deterministic heuristic이다. 실제 성과 데이터가 없으므로 점수를 “viral probability”로 표현하지 않는다.

## AI Shorts Generator에서 가져온 개념

긴 영상 clipping 제품에서 유용한 개념은 후보를 여러 개 만들고 hook, 정보 밀도, 호기심, 유지 가능성으로 순위를 매기는 단계 분리다. 현재 상품 쇼츠는 long-form clipping이 아니므로 transcript chunking, source-video ingestion, 자동 게시 기능은 가져오지 않는다.

## v2 점수 구조

Positive score:

| Dimension | Weight |
|---|---:|
| Hook strength | 22% |
| Retention | 18% |
| Problem clarity | 13% |
| Benefit specificity | 13% |
| Curiosity | 10% |
| Purchase intent | 10% |
| Clarity | 14% |

Risk penalty:

| Dimension | Penalty weight |
|---|---:|
| Overclaim risk | 15% |
| Repetition risk | 10% |

Hard blockers는 malformed runtime input, 빈 script/hook, 설정된 최대 길이를 넘는 hook, disclosure 누락, 명시적 과장, product anchor 누락, canonical/approved alias 누락 또는 본문 불일치, 상품 무관 script, 긴 첫 문장, 중복 후보, 증거 없는 개인 사용 경험이다. blocker가 있거나 최종 점수가 50 미만이면 `passed=false`다.

상품 정체성은 raw Coupang 상품명 전체 문자열이 아니라 `canonicalProductName` 또는 명시적으로 승인된 `productAliases`의 deterministic substring match로 확인한다. fuzzy match는 사용하지 않는다. `productAnchors`는 상품명 필드가 아니라 실제 hook/script에서 정체성 문자열을 제거한 뒤 남는 설명 본문에 존재해야 한다.

Hook 길이 상한은 `CREATIVE_SCORE_CONFIG.hookMaxChars=48`이다. 이는 현재 9:16 두 줄 hook 공간을 보수적으로 보호하기 위한 owner-review contract이며 scorer 내부 magic number가 아니다.

## 설계 이유

- 동일 입력은 동일 결과를 내며 외부 모델/API를 호출하지 않는다.
- 각 dimension과 penalty를 함께 보존해 사람이 점수 원인을 검토할 수 있다.
- blocker는 높은 soft score로 우회할 수 없다.
- ranker는 PASS 우선, total score, 낮은 risk, hook, retention, ID 순으로 안정 정렬한다.

## 한계와 다음 연구

- 한국어 형태소 분석 없이 키워드와 문장 길이를 사용한다.
- 실제 first-2-second retention, CTR, conversion과 아직 calibration되지 않았다.
- 40개 synthetic Korean commerce creative에 대해 scorer와 독립적으로 `GOOD/BORDERLINE/BAD/BLOCK` human label을 부여했다. 각 label 10개, top-tier precision 1.00, BAD/BLOCK false positive 0, GOOD false negative 0, hard-blocker agreement 1.00, pairwise ranking agreement 0.92였다.
- score min/max/median/p25/p75는 15.05/74.11/50.10/39.05/57.05이고 label 평균은 GOOD 71.07, BORDERLINE 51.55, BAD 39.10, BLOCK 36.57이다.
- 이 synthetic calibration 근거로 `KEEP_50`을 권고한다. threshold는 자동 변경하지 않았으며 실제 owner label 및 익명화 성과 지표로 재검증해야 한다.
