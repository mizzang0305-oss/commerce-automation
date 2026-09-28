# Product visual identity repair (source candidate)

This change is a fail-closed source candidate. It is not adopted by the operating producer or publisher runtimes, and it does not authorize restarting the Publisher Task.

## Rendering contract

- New live Coupang products use `product_information`: every shot uses the exact product reference downloaded for that product. The channel-wide v049 usage video is not attached or relabeled.
- The persistent overlay says `상품 이미지 · 실사용 아님`. A single product still is not claimed to be a real-use demonstration or a diverse filmed review.
- The source is constrained to the live run's asset root, decoded, hashed before and after rendering, and structurally bound to the provider product ID. Structural checks are **not** independent visual recognition or image-use rights approval.
- Existing reference-fixture generic-usage mode remains separate. It must not be selected for the live producer's product-information mode.

## Publishing contract

- Machine QA alone never creates a READY job. A signed `product-visual-review/v1` receipt must bind the exact product ID and canonical name, affiliate product ID and URL hash, current video SHA-256, input image/audio/narration/script hashes, a verified rights-evidence ID, a distinct-from-prior-publications result covering all prior video IDs, and reviewer ID/version/time/evidence. A nonempty ID is not itself proof of rights; only an independent trusted reviewer may sign after inspecting the underlying evidence.
- The receipt is verified with an Ed25519 public key in `PRODUCT_CONTENT_REVIEW_PUBLIC_KEY` before producer READY, after publisher claim, and again after channel identity/readiness immediately before `videos.insert`. The private signing key must remain outside producer, publisher, Git, and their environment. No signer or operating public key is provisioned by this PR.
- A changed file, wrong product, missing/forged/stale receipt, or unconfigured verifier fails closed. The uploader also rehashes bytes immediately before creating a YouTube upload session.
- Duplicate admission now blocks either a previously used product ID or identical whole-file bytes across channels. The signed cross-video review must cover the current full ledger because whole-file hashes do not detect a reused body with a different intro.

## Release and rollback

## 2026-09-25 review-only qualification

- A new, separate three-product namespace regenerated TTS, narration-bound captions, and final MP4s. The caption source is canonical **display narration intent**, not the ASR transcript; forced alignment supplies timing and must match the intended text. ASR remains a separate audio-identity check. All three visible caption timelines contain the canonical product names, and none reuse historical final-audio bytes. The two local ASR models still disagree with the exact spoken names, so acoustic identity is **NOT_TESTED**, not passed. The third bounded short-phrase TTS probe did not establish full-name correctness; no fourth blind pronunciation cycle is authorized by this qualification.
- The AI V2 evidence for these videos is explicitly `ai_visual` sampled analysis. It records unreviewed ranges, ASR-only audio, `acousticVerdict=not_tested`, and `rightsVerdict=unverified`; all three are `publicationEligibility=false`. A `composite` receipt requires both independent visual and actual acoustic evidence. `ai_visual` and `ai_audio` alone cannot sign a release receipt. The legacy `ai_multimodal` receipt value remains verifiable for compatibility, but the new reviewer label is `composite`.
- A read-only 1 fps, center-body dHash diagnostic compared the seven historical videos, three earlier fresh renders, and three new renders (13 files, 69 cross-product pairs). Nine high-coverage matches occurred among historical videos. No new-fresh pair reached high-coverage matching. This is supporting sampled evidence, **not** a complete semantic uniqueness approval. The original seven visual findings remain 4 `WRONG_PRODUCT` and 3 `MISLEADING_GENERIC_USE`.
- Official Coupang Partners [portal](https://partners.coupang.com/) advertises creating ads for products, while its [2025-10 guide](https://partners.coupangcdn.com/partners-guide/partners-guide-20251028182159.pdf) warns against using third-party content without permission. Its [2025-07 guide](https://partners.coupangcdn.com/partners-guide/partners-guide-20250714121952.pdf) distinguishes provided banners/widgets from unauthorized alteration of Coupang intellectual property. None of these inspected sources expressly grants downloading an individual product image and editing it into a public YouTube video body. Every current product image therefore remains `UNVERIFIED`; provenance and API access do not change `rightsReview` to passed.
- Conditional rights-safe routes for a future, separately reviewed design: use a provider-supplied promotional asset only within its express licensed surface and format; or make truthful original text/abstract graphics with no counterfeit product depiction; or obtain seller-owned imagery with written, product-specific promotional-video rights. Each route still needs affiliate-policy review, visual identity validation, and an independent signed receipt. None is currently an approved release input.
- Test-fixture Ed25519 signing and producer/publisher verifier regressions exercise the cryptographic path. No operating private key, actual-product signed receipt, runtime adoption, Publisher reactivation, or upload was performed.

The current Publisher Task is held Disabled under separate Owner approval. Do not adopt this source candidate or enable the Task until independent semantic/audio/rights review, the seven-video ledger review, trusted signing workflow, exact runtime manifest, regression proof, and a separate Owner release decision are complete.

To roll back this **source candidate**, revert its focused commit or close its Draft PR. That does not change the running stable producer/publisher files or the held Task. Do not restore old auto-publish behavior by enabling the Task without a new pre-insert identity gate.
