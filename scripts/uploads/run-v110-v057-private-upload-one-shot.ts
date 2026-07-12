import fs from "node:fs";
import path from "node:path";

import {
  uploadVideoBufferToR2
} from "../../src/lib/uploads/videoAssets/oneProductServerAssetRegistration";
import {
  APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD
} from "../../src/uploads/youtube/v083PrivateUploadExecutionReadiness";
import {
  createV083RealPrivateUploadExecutionAdapterFactory
} from "../../src/uploads/youtube/v083RealPrivateUploadExecutionAdapterCore";
import {
  runV084PrivateUploadPilotExecution
} from "../../src/uploads/youtube/v084PrivateUploadExecutionInvocationRuntime";
import {
  createV092ServerOnlyYouTubePrivateUploadExecutor
} from "../../src/uploads/youtube/v092ServerOnlyYouTubePrivateUploadExecutor";
import {
  createV094ServerOnlyUploadPackageRequestResolver
} from "../../src/uploads/youtube/v094ServerOnlyUploadPackageRequestResolver";
import {
  runV110V057PrivateUploadOneShot,
  type V110PrivateExecutionResult
} from "../../src/uploads/youtube/v110V057PrivateUploadOneShot";
import {
  createV114ServerLocalVideoAssetReader,
  prepareV114ServerLocalVideoAsset
} from "../../src/uploads/youtube/v114ServerLocalPreparedVideoAsset";
import { V115_VIDEO_ASSET_SELECTION } from "../../src/uploads/youtube/v115ExactV113AssetContract";
import {
  createV115ExactV113ServerLocalVideoAssetReader,
  prepareV115ExactV113ServerLocalVideoAsset
} from "../../src/uploads/youtube/v115ExactV113ServerLocalPreparedVideoAsset";

async function main() {
  const cwd = process.env.V095_CWD || process.env.V084_CWD || process.cwd();
  const env = loadLocalEnv(cwd, process.env);
  Object.assign(process.env, env);
  const execute = process.argv.includes("--execute");
  const useExactV113Asset = process.argv.includes("--exact-v113-asset");
  const useServerLocalAsset = process.argv.includes("--server-local-asset") || useExactV113Asset;
  const report = await runV110V057PrivateUploadOneShot({
    cwd,
    env,
    mode: execute ? "execute" : "preflight",
    assetPreparationStrategy: useServerLocalAsset ? "server_local_file" : "r2",
    videoAssetSelection: useExactV113Asset
      ? V115_VIDEO_ASSET_SELECTION
      : "v057_corrected_preview",
    prepareAsset: async (input) => {
      if (useServerLocalAsset) {
        const local = useExactV113Asset
          ? await prepareV115ExactV113ServerLocalVideoAsset({
              cwd,
              queueItemId: input.queueItemId
            })
          : await prepareV114ServerLocalVideoAsset({
              cwd,
              queueItemId: input.queueItemId
            });
        return local.ok
          ? { ok: true, assetRef: local.assetRef }
          : { ok: false, blocker: local.blocker };
      }
      const result = await uploadVideoBufferToR2({
        candidateId: input.queueItemId,
        file_buffer: input.bytes,
        file_name: input.fileName,
        mime_type: "video/mp4",
        size_bytes: input.sizeBytes,
        checksum_sha256: input.checksumSha256
      });
      return result.ok
        ? { ok: true, assetRef: result.asset_ref, diagnostics: result.diagnostics }
        : {
            ok: false,
            blocker: result.blocked_reasons[0] ?? result.error_code,
            diagnostics: result.diagnostics
          };
    },
    executePrivateUpload: async (
      preparedAsset,
      request,
      ownerReviewEvidence
    ): Promise<V110PrivateExecutionResult> => {
      const uploadRequestResolver = createV094ServerOnlyUploadPackageRequestResolver({
        cwd,
        env,
        uploadAssetProfile: env.V051_UPLOAD_ASSET_PROFILE ?? "v057_corrected_reupload",
        preparedVideoAssetRefs: {
          father_jobs: preparedAsset
        },
        ownerReviewedPrivatePilotEvidence: {
          ...ownerReviewEvidence,
          channelKey: "father_jobs"
        }
      });
      const uploadExecutor = createV092ServerOnlyYouTubePrivateUploadExecutor({
        cwd,
        env,
        uploadRequestResolver,
        preparedVideoAssetReader: useServerLocalAsset
          ? useExactV113Asset
            ? createV115ExactV113ServerLocalVideoAssetReader({ cwd })
            : createV114ServerLocalVideoAssetReader({ cwd })
          : undefined
      });
      const factory = createV083RealPrivateUploadExecutionAdapterFactory({
        buildApprovalPhrase: APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD,
        serverOnlyContext: true,
        v081PilotReady: request.readiness.v081PilotReady,
        v082RuntimeAdapterReady: request.readiness.v082RuntimeAdapterReady,
        tokenProviderReady: request.readiness.tokenProviderReady,
        uploadScopeReady: request.readiness.uploadScopeReady,
        videoAssetReady: request.readiness.videoAssetReady,
        uploadPackageReady: request.readiness.uploadPackageReady,
        duplicateGuardReady: request.readiness.duplicateGuardReady,
        disclosureGuardReady: request.readiness.disclosureGuardReady,
        affiliateEvidenceReady: request.readiness.affiliateEvidenceReady,
        targetChannelEvidenceReady: request.readiness.targetChannelEvidenceReady,
        requestedVisibility: "private",
        maxItems: 1,
        commentAutomationRequested: false,
        schedulerExecutionRequested: false,
        uploadExecutor
      });
      const result = await runV084PrivateUploadPilotExecution(request, {
        adapter: factory.adapter
      });
      return {
        completed: result.status === "private_upload_completed",
        blockers: [...result.blockers, ...result.v081Blockers, ...result.v083Blockers],
        videosInsertCalled: result.videosInsertCalled,
        videosInsertTotalCount: result.videosInsertTotalCount,
        commentThreadsInsertCalled: false,
        uploadResultEvidencePresent: result.uploadResultEvidence.present,
        youtubeVideoIdHashPrefix: result.uploadResultEvidence.youtubeVideoIdHashPrefix,
        channelIdHashPrefix: result.uploadResultEvidence.channelIdHashPrefix,
        fakeSuccess: false
      };
    }
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (execute && report.status !== "private_upload_completed") {
    process.exitCode = 1;
  }
}

function loadLocalEnv(cwd: string, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  const envPath = path.join(cwd, ".env.local");
  if (!fs.existsSync(envPath)) return env;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    if (!key || env[key] !== undefined) continue;
    env[key] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

main().catch(() => {
  const useExactV113Asset = process.argv.includes("--exact-v113-asset");
  process.stdout.write(`${JSON.stringify({
    version: useExactV113Asset ? "v115" : "v110",
    mode: useExactV113Asset
      ? "v113_exact_local_private_upload_one_shot"
      : "v057_r2_private_upload_one_shot",
    status: "blocked",
    blockers: ["BLOCKED_V110_SAFE_SERVER_ERROR"],
    videoAssetSelection: useExactV113Asset
      ? V115_VIDEO_ASSET_SELECTION
      : "v057_corrected_preview",
    selectedVideoVersion: useExactV113Asset ? "v113" : "v057",
    selectedVideoFileName: useExactV113Asset
      ? "preview-v113.mp4"
      : "corrected-preview-v057.mp4",
    selectedVideoSha256Prefix: null,
    exactAssetEvidenceReady: false,
    noV057Fallback: useExactV113Asset,
    noV112Fallback: useExactV113Asset,
    assetPreparationStrategy: "r2",
    assetPreparationReady: false,
    assetPreparationApprovalAccepted: false,
    assetPreparationAttempted: false,
    assetPrepared: false,
    r2UploadAttempted: false,
    R2_upload: false,
    r2HttpStatus: null,
    r2SafeErrorCode: null,
    localAssetReadAttempted: false,
    localAssetPrepared: false,
    youtubeExecutionAttempted: false,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  }, null, 2)}\n`);
  process.exitCode = 1;
});
