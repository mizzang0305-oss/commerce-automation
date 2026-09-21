# Remotion Evaluation

공식 기준: [Remotion documentation](https://www.remotion.dev/docs/), [license and terms](https://www.remotion.dev/docs/license).

## 현재 판정

`EXPERIMENTAL_CONTRACT_ONLY`, `NOT_INSTALLED`.

Remotion은 React 기반 visual composition, parameterized video, captions, preview와 server/client rendering을 제공한다. 그러나 현재 Production에는 이미 Python Worker + FFmpeg 경로가 있고, 라이선스/가격은 commercial eligibility 검토가 필요하다. 따라서 dependency, composition, Chromium renderer를 이번 PR에 추가하지 않는다.

## v1 contract

- 1080x1920, 30fps를 고정한다.
- candidate, local assets, local audio, captions, exact output path를 입력으로 받는다.
- 기본 renderer는 `disabled`다.
- experimental adapter가 다른 output을 반환하면 fail closed한다.
- upload method나 Production storage binding은 계약에 없다.

## 향후 A/B 계획

동일 product/script/audio/assets를 사용해 FFmpeg와 Remotion을 비교한다.

- render wall time 및 peak memory
- Korean caption wrapping, safe-area, hook animation 품질
- frame determinism과 재현성
- H.264/AAC output conformance
- dependency/CVE/update 부담
- commercial license 비용 및 운영 조건

Owner가 별도 승인하기 전에는 Remotion 설치나 render를 하지 않는다.
