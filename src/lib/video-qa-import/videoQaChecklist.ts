export const generatedVideoBaseQaChecklist = [
  "Confirm video file opens in a local player outside the WebApp.",
  "Confirm final duration is between 10 and 60 seconds for short-form manual upload.",
  "Confirm format is vertical shorts_9_16 or explicitly mark it for manual review.",
  "Confirm subtitles, narration, CTA, and disclosure are readable on mobile.",
  "Confirm no fake review, guaranteed effect, fabricated discount, or medical efficacy claim.",
  "Confirm this bridge did not read local files, upload assets, write DB records, or create worker jobs."
];

export const generatedVideoNextSteps = [
  "Copy the video QA markdown for manual review.",
  "Keep rejected or needs_fix videos out of manual upload package planning.",
  "Only passed or selected_for_manual_upload videos can move to a later manual upload package step.",
  "Do not upload to R2, create channel upload packages, or post to SNS in this bridge."
];
