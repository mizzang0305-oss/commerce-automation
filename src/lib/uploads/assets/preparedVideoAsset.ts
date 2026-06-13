export type { PreparedVideoAssetProvider, PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
export {
  PREPARED_VIDEO_ASSET_SIDE_EFFECTS,
  R2PreparedVideoAssetProviderScaffold,
  type PreparedVideoAssetProviderContract,
  type PreparedVideoAssetProviderResult,
  type PreparedVideoAssetSideEffects
} from "@/lib/uploads/assets/preparedVideoAssetProvider";
export { buildMockPreparedVideoAssetRef } from "@/lib/uploads/assets/mockPreparedVideoAssetProvider";
export {
  buildPreparedVideoAssetInputFromManualRegistration,
  maskPreparedVideoAssetDisplay,
  toPreparedVideoAssetApiSummary,
  validatePreparedVideoAssetRef,
  type PreparedVideoAssetBlockedReason,
  type PreparedVideoAssetSafeDisplay,
  type PreparedVideoAssetValidationResult
} from "@/lib/uploads/assets/preparedVideoAssetValidator";
