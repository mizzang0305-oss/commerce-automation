# MoneyPrinterTurbo Architecture Extraction

검토 기준: [official repository](https://github.com/harry0703/MoneyPrinterTurbo), [official English README](https://github.com/harry0703/MoneyPrinterTurbo/blob/main/README-en.md), [official license](https://github.com/harry0703/MoneyPrinterTurbo/blob/main/LICENSE).

## 판정

`ARCHITECTURE_RESEARCH_COMPLETE`. 코드 vendoring, dependency 설치, clone, copy-paste는 하지 않았다.

| Capability | MoneyPrinterTurbo | Current Commerce Automation | Keep Current | Extract Idea | Do Not Use |
|---|---|---|---|---|---|
| Script generation | provider-pluggable | existing product/creative plans | Yes | provider boundary | cloud provider defaults |
| Material sourcing | online/local sources | signed product/scene provenance | Yes | source adapter separation | unsourced asset acceptance |
| TTS | multiple providers | approved Korean local provider gate | Yes | previewable provider interface | production provider replacement |
| Subtitles | configurable generation | SRT/ASR/creative QA | Yes | word timing as optional evidence | QA bypass |
| Rendering | MoviePy/FFmpeg workflow | production Python Worker/FFmpeg | Yes | batch candidate comparison | renderer replacement |
| UI/API | Streamlit/FastAPI | Production WebApp | Yes | job status visibility | second control plane |
| Batch generation | multiple outputs | queue/worker orchestration | Yes | rank-before-render | duplicate lifecycle |
| Publishing | configurable ecosystem | owner-gated upload path | Yes | none in v1 | automatic publishing |

## 가져올 것

- script, material, speech, subtitle, render를 명시적 단계로 분리하는 관점
- 여러 creative 후보를 생성한 뒤 비용이 큰 render 전에 ranking하는 방식
- provider adapter와 local asset option의 분리

## 가져오지 않을 것

- Production Queue/Worker와 중복되는 MVC/API/control plane
- API key 기반 external provider 구성
- MoviePy/FFmpeg renderer 복제
- 자동 게시, asset download, cloud TTS 기본값

공식 프로젝트는 Python 3.11, MoviePy, Streamlit, FastAPI, faster-whisper 등의 dependency를 사용한다. 본 저장소에는 추가하지 않는다.
