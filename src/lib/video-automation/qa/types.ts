export type HookFamily = "PROBLEM" | "LOSS" | "CURIOSITY" | "CHECKLIST" | "BEFORE_AFTER" | "SPACE" | "QUESTION";

export type CaptionAnimation = "pop" | "scale" | "fade" | "none";

export type VisualQaMeasurements = {
  fileSize: number;
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: string;
  videoCodec: string | null;
  audioCodec: string | null;
  videoStream: boolean;
  audioStream: boolean;
  firstFramePath: string;
  firstThreeSecondsContactSheetPath: string;
  contactSheetPath: string;
  sampledFramePaths: string[];
  freezeRatio: number;
  longestFreezeSeconds: number;
  visualChangeRatio: number;
  canvasFillRatio: number;
  emptyCanvasRatio: number;
  integratedLoudnessLufs: number | null;
  truePeakDb: number | null;
  longSilenceCount: number;
  longestSilenceMs: number;
  meanPauseMs: number;
  qaOverheadSeconds: number;
};

export type AutomatedVideoQualityDimensions = {
  first3: number;
  motion: number;
  occupancy: number;
  caption: number;
  creativeDiversity: number;
  productClarity: number;
  audioPacing: number;
  layoutSafety: number;
  policyClarity: number;
};

export type CodexVisualReview = {
  visualReviewExecuted: boolean;
  passed: boolean;
  reviewer: "codex_local_visual_inspection";
  inspectedPaths: string[];
  firstFrameNote: string;
  firstThreeSecondsNote: string;
  contactSheetNote: string;
};

export type AutomatedVideoReview = {
  version: "autonomous-video-review-v2";
  productKey: string;
  attempt: "initial" | "repair-1" | "repair-2" | "final";
  selectedHook: string;
  hookFamily: HookFamily;
  dimensions: AutomatedVideoQualityDimensions;
  score: number;
  threshold: 75;
  first3Threshold: 70;
  blockers: string[];
  signals: string[];
  measurements: VisualQaMeasurements;
  technicalQaPassed: boolean;
  automatedVisualQaPassed: boolean;
  audioQaPassed: boolean;
  creativeQaPassed: boolean;
  motionQaPassed: boolean;
  captionQaPassed: boolean;
  productEvidenceQaPassed: boolean;
  machineQaPassed: boolean;
  finalAutomatedQaPassed: boolean;
  humanOwnerReviewStatus: "not_requested";
  publishReady: false;
  visualReview: CodexVisualReview;
  action: "PASS" | "REPAIR" | "BLOCK";
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export type AutomatedReviewInput = {
  productKey: string;
  attempt: AutomatedVideoReview["attempt"];
  selectedHook: string;
  hookFamily: HookFamily;
  measurements: VisualQaMeasurements;
  asrPassed: boolean;
  alignedRatio: number;
  layoutCollision: boolean;
  captionTimelinePassed: boolean;
  captionMaxWords: number;
  captionFontPx: number;
  captionAnimation: CaptionAnimation;
  primaryVisualWidthRatio: number;
  genericUsage: boolean;
  genericOverclaim: boolean;
  productIdentityBound: boolean;
  productAnchorCount: number;
  hookFamilyUniqueInBatch: boolean;
  usageLabelFullOnce: boolean;
  usageLabelAbbreviatedAfterIntro: boolean;
  hookVisibleAtSeconds: number;
  hookFontPx: number;
  hookHighContrast: boolean;
  codexVisualReview?: CodexVisualReview;
};
