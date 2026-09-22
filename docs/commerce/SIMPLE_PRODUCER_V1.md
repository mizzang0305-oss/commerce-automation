# SIMPLE Producer V1

## Purpose

`simple-producer:run-once` creates at most one real Coupang product video per configured KST slot. It uses the existing SIMPLE MVP path for search, affiliate binding, owner-reviewed usage evidence, TTS, local rendering, and machine QA.

The producer never calls YouTube. Only a machine-QA-passed video is written as one `youtube_public_upload` `ready` job in the existing external publisher ledger. The existing guarded publisher retains all channel-token, identity, duplicate, cap, `videos.insert`, API-readback, and ledger responsibilities.

## External configuration

The runtime requires `SIMPLE_PRODUCER_CONFIG_PATH` to reference an absolute path outside the repository. The JSON shape is:

```json
{
  "schema": "simple-producer/v1",
  "enabled": true,
  "dailyGenerateTarget": 3,
  "maxItemsPerRun": 1,
  "generationSlots": ["09:00", "15:00", "21:00"],
  "timeZone": "Asia/Seoul",
  "evidenceRoot": "D:\\Secure\\commerce-control\\simple-producer-v1"
}
```

`evidenceRoot` and its `simple-producer-state.json` are external to the source/runtime checkout. `YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH` must remain the existing external publisher state path.

## Operator settings

After the external configuration file exists, use the stable runtime command:

```powershell
npm run simple-producer:settings -- --show
npm run simple-producer:settings -- --enabled true --daily-target 3 --slots 09:00,15:00,21:00
```

The command only changes `enabled`, `dailyGenerateTarget`, and `generationSlots`. It rejects a target outside `1..3`, a per-run maximum other than one, duplicate or unordered slots, and any slot after 21:00 KST. It does not alter Daily69 settings.

## Run-once rules

- A date/slot is claimed before discovery and is never retried after either success or failure.
- Existing publisher ledger entries and queued jobs are supplied to discovery as excluded product IDs.
- A KST day with `dailyGenerateTarget` successes returns `SIMPLE_PRODUCER_DAILY_TARGET_REACHED`.
- Only an exact configured slot runs; after 21:00 there is no catch-up or backfill run.
- `LIVE_PRODUCT_VIDEO_TARGET_COUNT=1` and channel-supported use cases are passed only to the child producer invocation. Existing three-product CLI behavior stays the default outside producer runs.
- Outputs are written under the configured external evidence root, not the repository.

## Safety boundary

- `videosInsertCalls=0` for every producer outcome.
- `SAFE_TO_UPLOAD=false` remains global.
- Daily69, reserve planning, and product-001 remain outside this component.
