export type V074YouTubeAdvancedSettings = {
  privacyStatus: "public";
  selfDeclaredMadeForKids: false;
  containsSyntheticMedia: true;
  paidProductPlacementDetails: {
    hasPaidProductPlacement: true;
  };
  license: "youtube";
  embeddable: true;
  publicStatsViewable: true;
  defaultLanguage: "ko";
  defaultAudioLanguage: "ko";
};

export function buildV074YouTubeAdvancedSettings(): V074YouTubeAdvancedSettings {
  return {
    privacyStatus: "public",
    selfDeclaredMadeForKids: false,
    containsSyntheticMedia: true,
    paidProductPlacementDetails: {
      hasPaidProductPlacement: true
    },
    license: "youtube",
    embeddable: true,
    publicStatsViewable: true,
    defaultLanguage: "ko",
    defaultAudioLanguage: "ko"
  };
}
