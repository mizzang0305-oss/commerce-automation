import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";

export type PreparedVideoAssetSideEffects = {
  external_api_called: false;
  r2_uploaded: false;
  db_written: false;
  queue_created: false;
  worker_job_created: false;
};

export const PREPARED_VIDEO_ASSET_SIDE_EFFECTS: PreparedVideoAssetSideEffects = {
  external_api_called: false,
  r2_uploaded: false,
  db_written: false,
  queue_created: false,
  worker_job_created: false
};

export type PreparedVideoAssetProviderResult =
  | {
      ok: true;
      asset_ref: PreparedVideoAssetRef;
      side_effects: PreparedVideoAssetSideEffects;
    }
  | {
      ok: false;
      error_code: "PREPARED_VIDEO_ASSET_NOT_READY" | "PREPARED_VIDEO_ASSET_PROVIDER_NOT_CONFIGURED";
      blocked_reasons: string[];
      side_effects: PreparedVideoAssetSideEffects;
    };

export interface PreparedVideoAssetProviderContract {
  readonly provider_id: string;
  prepare(input: unknown): Promise<PreparedVideoAssetProviderResult>;
}

export class R2PreparedVideoAssetProviderScaffold implements PreparedVideoAssetProviderContract {
  readonly provider_id = "r2";

  async prepare(): Promise<PreparedVideoAssetProviderResult> {
    return {
      ok: false,
      error_code: "PREPARED_VIDEO_ASSET_PROVIDER_NOT_CONFIGURED",
      blocked_reasons: ["r2_upload_not_implemented_in_this_pr"],
      side_effects: PREPARED_VIDEO_ASSET_SIDE_EFFECTS
    };
  }
}
