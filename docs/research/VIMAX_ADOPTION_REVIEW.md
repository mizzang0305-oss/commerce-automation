# ViMax Adoption Review

Review date: 2026-06-03

Reviewed upstream:

- https://github.com/HKUDS/ViMax
- https://github.com/HKUDS/ViMax/blob/main/LICENSE
- https://github.com/HKUDS/ViMax/blob/main/pyproject.toml
- https://github.com/HKUDS/ViMax/blob/main/configs/idea2video.yaml
- https://github.com/HKUDS/ViMax/blob/main/configs/script2video.yaml
- https://github.com/HKUDS/ViMax/blob/main/tools/video_generator_veo_google_api.py
- https://github.com/HKUDS/ViMax/blob/main/tools/image_generator_nanobanana_google_api.py

## 1. Summary Decision

Do not integrate ViMax as a full dependency now.

ViMax is a useful reference for agentic video planning, storyboard generation, shot metadata, consistency checks, and generation-stage orchestration. It is not a good direct fit for the current Coupang MVP because it is an end-to-end AI video generation framework that expects multiple external AI providers and a separate artifact working directory. Commerce Automation already has a narrower production path:

```text
Coupang candidate -> queue -> content draft -> next-batch -> Python Worker -> R2 video_ready -> channel upload package -> manual upload result tracking
```

The right adoption path is to keep ViMax as a reference and build small internal planning modules that produce safe `render_plan` JSON for the existing Python Worker. This preserves the current R2/manual-upload pipeline and avoids adding paid generation APIs, broad dependencies, or new secret surfaces.

Recommended conclusion:

- Do not copy ViMax code into this repository.
- Do not add ViMax dependencies to the Python Worker.
- After Coupang MVP stabilization, implement storyboard and shot-planner scaffolds as internal modules.
- Keep template fallback content generation and current ffmpeg/R2 rendering as the default path.

## 2. Free vs Paid Boundary

Free or low-cost parts:

- Repository source is open under MIT.
- Design concepts can be studied without installing dependencies.
- Planning patterns such as scene lists, shot metadata, reference-image selection, rate-limit awareness, and retry/fallback orchestration can be reimplemented internally.

Likely paid or quota-bound parts:

- Chat model calls through OpenRouter/OpenAI-compatible APIs.
- Google image generation through `google-genai`.
- Google Veo video generation through `google-genai`.
- MiniMax chat provider if configured.
- Any API-based multi-scene generation loop can multiply cost quickly because it may call chat, image, and video generators per scene or shot.

Local compute boundary:

- ViMax does not appear to require local GPU for the default documented flow; the heavy image/video generation path is API-based.
- It still brings heavy local Python dependencies such as FAISS, OpenCV, MoviePy, LangChain, and scene detection.
- The `pyproject.toml` references PyTorch CUDA 12.8 package indexes for `torch` and `torchaudio` source mapping. These are not enough alone to prove GPU is mandatory, but they are a warning sign for environment complexity if the project grows or transitive features pull them in.

## 3. License

ViMax is MIT licensed.

Implications:

- Studying the design is fine.
- Reusing code would require preserving the MIT license notice and copyright notice.
- This review recommends no direct code copy. Internal reimplementation of selected planning concepts is cleaner and avoids license notice handling across the production worker.
- If any future PR copies material code, the PR must include explicit license attribution and a license compatibility review.

## 4. Dependencies and Runtime Requirements

Upstream requirements observed:

- Python: `>=3.12`
- Environment manager: `uv`
- Direct dependencies in `pyproject.toml` include:
  - `chardet`
  - `faiss-cpu`
  - `google-genai`
  - `langchain`
  - `langchain-community`
  - `langchain-openai`
  - `moviepy`
  - `openai`
  - `opencv-python`
  - `scenedetect[opencv]`

Runtime shape:

- OS support is documented as Linux and Windows.
- Config-driven execution uses YAML files such as `configs/idea2video.yaml` and `configs/script2video.yaml`.
- The documented install path is `uv sync`, not the current Python Worker `pip install -r requirements.txt` workflow.
- Generated artifacts are written under a ViMax working directory such as `.working_dir/idea2video` or `.working_dir/script2video`.

Compatibility with commerce-automation:

- Python version aligns with the current Python 3.12 worker direction.
- Dependency model does not align. Our worker intentionally keeps default runtime narrower and uses optional requirement files for heavier functionality.
- MoviePy is currently optional in this project; making it mandatory through ViMax would reverse that boundary.
- OpenCV, FAISS, LangChain, Google GenAI, OpenAI, and scene detection would materially increase install time, binary compatibility risk, and CI/runtime surface.
- Windows is documented upstream, but OpenCV/FAISS/MoviePy/ffmpeg edge cases still need independent smoke tests before any runtime adoption.

## 5. External API Cost Possibility

ViMax's documented configs include three API-backed generation layers:

1. Chat model
   - Example: Gemini model routed through OpenRouter with an OpenAI-compatible provider.
   - Config includes `api_key` and `base_url`.

2. Image generator
   - Example class: `tools.ImageGeneratorNanobananaGoogleAPI`.
   - Uses `google-genai` and an API key.

3. Video generator
   - Example class: `tools.VideoGeneratorVeoGoogleAPI`.
   - Uses `google-genai` and Veo model names.

ViMax also documents MiniMax as an OpenAI-compatible alternative provider and can read `MINIMAX_API_KEY` from the environment.

Commerce Automation must not add these keys or call these providers in this review PR. Any future AI provider PR must keep the current template fallback, return safe provider metadata, and avoid client exposure of API keys.

## 6. Why Not Adopt ViMax Directly Now

Direct integration is not recommended for these reasons:

- Scope mismatch: ViMax is an end-to-end AI generation framework; Commerce Automation is an operator-controlled Coupang affiliate pipeline.
- Cost risk: ViMax's default flow can require chat, image, and video generation APIs.
- Dependency risk: It would add LangChain, OpenAI, Google GenAI, FAISS, OpenCV, MoviePy, and scene detection into or beside the worker.
- Runtime drift: ViMax uses `uv sync`; our worker uses a controlled `requirements.txt` plus optional requirement files.
- Artifact mismatch: ViMax writes local working-directory artifacts; Commerce Automation expects worker results to be uploaded through configured storage such as R2 and recorded as `product_assets`.
- Secret-surface risk: YAML configs contain `api_key` fields. This project keeps secrets server-side or worker-side and does not expose them in client components.
- Product fit: Current MVP needs reliable 9:16 product shorts, not multi-agent long-form narrative generation.
- Operational safety: The current pipeline deliberately separates candidate import, queue promotion, content draft, next-batch worker job creation, R2 artifacts, channel package creation, and manual upload tracking. A full ViMax integration would blur those boundaries.

## 7. Design Patterns Worth Extracting

Useful patterns to reimplement internally:

- Idea/script to storyboard
  - Convert product facts and template content into a small list of scenes.
  - For Coupang MVP, keep this to 3-5 short-form beats rather than long-form story arcs.

- Shot planner
  - Store shot purpose, visual focus, camera framing, on-screen text, narration line, and asset reference.
  - Use this as input to the existing ffmpeg renderer.

- Multi-scene video plan
  - Persist a deterministic `render_plan` JSON in `generated_contents` or a future planning table.
  - Keep generated video jobs under `/api/run/next-batch` only.

- Image consistency check
  - Check that product image URLs are valid and that downloaded images are non-empty and usable.
  - Later: add low-cost deterministic checks first, such as resolution, aspect ratio, file size, and dominant blank areas.

- Generated image quality check
  - Useful conceptually, but API-generated images should remain out of scope until a dedicated provider PR.

- Prompt template structure
  - Build prompt templates as internal data structures, not provider-specific YAML with raw keys.
  - Keep templates product-safe: no unverifiable claims, no medical efficacy claims, no copied review text.

- Scene/shot metadata model
  - Add explicit metadata fields for scene order, duration, visual asset, text overlay, narration, and safe claim checks.

- Rate-limit awareness
  - ViMax's rate limiter pattern is useful if future AI APIs are enabled.
  - For now, only document and scaffold; do not add external API calls.

## 8. Applicable PR Candidates

Recommended minimal PR sequence:

1. `docs(research): review ViMax adoption for video planning`
   - This PR.
   - Adds review only.
   - No runtime dependency, no API key, no behavior change.

2. `feat(content): add render plan schema scaffold`
   - Add TypeScript types and validation for `render_plan`.
   - Add tests for safe product claims and required image/script fields.
   - No provider calls.
   - No worker job creation outside next-batch.

3. `feat(content): add storyboard template planner`
   - Generate deterministic scene/shot plans from product queue item and generated content.
   - Store plan JSON with generated content.
   - Keep template fallback as default.

4. `feat(worker): render from shot plan`
   - Teach Python Worker renderer to consume an internal `render_plan` if present.
   - Preserve current simple render path as fallback.
   - Upload artifacts through existing R2/local storage adapter.

5. `test(pipeline): add storyboard smoke fixtures`
   - Add fixture queue items and expected `render_plan` snapshots.
   - Confirm `next-batch` still owns worker job creation.

6. `feat(content): add optional AI storyboard provider scaffold`
   - Only after deterministic planner is stable.
   - Keep provider disabled/template by default.
   - No image/video generation API calls by default.

## 9. Recommended Order

Recommended order:

1. Keep current Coupang candidate -> queue -> content draft -> next-batch -> worker -> R2 -> manual upload package flow stable.
2. Add internal `render_plan` schema and tests.
3. Add deterministic storyboard/shot planner using product data and current content templates.
4. Extend Python Worker to render from `render_plan`.
5. Add quality checks for rendered scenes and thumbnails.
6. Only then consider optional AI provider scaffolds for storyboard text, with template fallback retained.

Do not start with ViMax dependency installation. The first useful value is the planning model, not the runtime stack.

## 10. Defer or Exclude

Defer:

- Google Veo video generation.
- Google image generation.
- OpenRouter or MiniMax chat routing.
- LangChain/RAG-based long script generation.
- FAISS indexing.
- Multi-agent loops.
- Parallel shot generation against paid APIs.
- Cameo/photo-person workflows.
- Any OAuth or platform upload integration.

Exclude from current MVP:

- Direct ViMax code copy.
- Replacing Python Worker.
- Replacing R2 artifact storage.
- Creating worker jobs during content planning.
- Enabling public upload.
- YouTube/TikTok/Threads API upload paths.

## 11. Final Conclusion

ViMax should remain a reference, not a dependency.

The project can benefit from ViMax's high-level planning concepts: storyboard, shot list, reference selection, consistency checks, and generation-stage orchestration. Those concepts should be reimplemented as small internal modules that produce safe, testable `render_plan` JSON for the existing Python Worker.

The recommended next implementation PR is:

```text
feat(content): add render plan schema scaffold
```

That PR should add only internal schema, validation, and tests. It should not add external API keys, paid API calls, ViMax dependencies, platform uploads, or changes to the current worker job ownership model.

Safety decision:

- full_vimax_adoption_now: NO
- new_runtime_dependency_added: NO
- external_api_call_added: NO
- platform_upload_added: NO
- public_upload_enabled: NO
- recommended_use: reference-only storyboard and shot-planner patterns
