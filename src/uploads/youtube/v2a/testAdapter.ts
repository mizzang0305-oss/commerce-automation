export type V2AMockUploadResult = {
  status: "simulated_private_upload";
  mock: true;
  productionUpload: false;
  youtubeVideoId: null;
  platformUpload: 0;
};

/**
 * A fixture-only adapter that deliberately cannot satisfy the production
 * coordinator's upload result type.
 */
export function createV2AMockUploadAdapter() {
  return {
    async simulate(): Promise<V2AMockUploadResult> {
      return {
        status: "simulated_private_upload",
        mock: true,
        productionUpload: false,
        youtubeVideoId: null,
        platformUpload: 0
      };
    }
  };
}
