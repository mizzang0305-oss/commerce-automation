# Product visual identity repair (source candidate)

This change is a fail-closed source candidate. It is not adopted by the operating producer or publisher runtimes, and it does not authorize restarting the Publisher Task.

## Rendering contract

- New live Coupang products use `product_information`: every shot uses the exact product reference downloaded for that product. The channel-wide v049 usage video is not attached or relabeled.
- The persistent overlay says `상품 이미지 · 실사용 아님`. A single product still is not claimed to be a real-use demonstration or a diverse filmed review.
- The source is constrained to the live run's asset root, decoded, hashed before and after rendering, and structurally bound to the provider product ID. Structural checks are **not** independent visual recognition or image-use rights approval.
- Existing reference-fixture generic-usage mode remains separate. It must not be selected for the live producer's product-information mode.

## Publishing contract

- Machine QA alone never creates a READY job. A signed `product-visual-review/v1` receipt must bind the exact product ID and current video SHA-256, asset/audio/narration hashes, rights evidence, completed product/audio/cross-video review, reviewer/evidence identity, and all prior published video IDs.
- The receipt is verified with an Ed25519 public key in `PRODUCT_CONTENT_REVIEW_PUBLIC_KEY` both before producer READY and again immediately before publisher token acquisition and `videos.insert`. The private signing key must remain outside producer, publisher, Git, and their environment. No signer or operating public key is provisioned by this PR.
- A changed file, wrong product, missing/forged/stale receipt, or unconfigured verifier fails closed. The uploader also rehashes bytes immediately before creating a YouTube upload session.
- Duplicate admission now blocks either a previously used product ID or identical whole-file bytes across channels. The signed cross-video review must cover the current full ledger because whole-file hashes do not detect a reused body with a different intro.

## Release and rollback

The current Publisher Task is held Disabled under separate Owner approval. Do not adopt this source candidate or enable the Task until independent semantic/audio/rights review, the seven-video ledger review, trusted signing workflow, exact runtime manifest, regression proof, and a separate Owner release decision are complete.

To roll back this **source candidate**, revert its focused commit or close its Draft PR. That does not change the running stable producer/publisher files or the held Task. Do not restore old auto-publish behavior by enabling the Task without a new pre-insert identity gate.
