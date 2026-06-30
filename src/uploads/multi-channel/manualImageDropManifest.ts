import path from "node:path";

import { CHANNEL_KEYS, type ChannelKey, getChannelProfile } from "./channelProfiles";
import { getRequiredSceneObjectGroups } from "./sceneObjectRequirementGate";

export type ManualImageDropFile = {
  scene_key: string;
  filename: string;
  path: string;
  prompt: string;
  required_visuals: string[];
  forbidden_visuals: string[];
};

export type ManualImageDropChannel = {
  channel_key: ChannelKey;
  product_name: string;
  expected_dir: string;
  evidence_filename: "manual-image-semantic-evidence.json";
  required_object_groups: string[][];
  files: ManualImageDropFile[];
};

export type ManualImageDropManifest = {
  version: "v041";
  required_image_count: number;
  common_requirements: string[];
  forbidden_conditions: string[];
  channels: ManualImageDropChannel[];
};

const CHANNEL_PRODUCT_NAMES: Record<ChannelKey, string> = {
  father_jobs: "차량용 컵홀더 정리함",
  neoman_moleulgeol: "접이식 빨래건조대",
  lets_buy: "특가 케이블 정리함"
};

const CHANNEL_FILENAMES: Record<ChannelKey, string[]> = {
  father_jobs: [
    "01-car-messy-cup-holder.png",
    "02-car-console-clutter.png",
    "03-organizer-product-reveal.png",
    "04-driver-organizing-items.png",
    "05-clean-car-console-after.png",
    "06-car-dashboard-cta.png"
  ],
  neoman_moleulgeol: [
    "01-rain-window-laundry-problem.png",
    "02-wet-laundry-slow-dry.png",
    "03-small-room-laundry-mess.png",
    "04-drying-rack-solution-reveal.png",
    "05-laundry-use-case-human-hands.png",
    "06-organized-indoor-drying-result.png"
  ],
  lets_buy: [
    "01-messy-desk-cables.png",
    "02-cable-clutter-closeup.png",
    "03-cable-organizer-reveal.png",
    "04-organized-desk-after.png",
    "05-before-after-cable-setup.png",
    "06-clean-desk-cta.png"
  ]
};

export function buildV041ManualImageDropManifest(input: { cwd?: string } = {}): ManualImageDropManifest {
  const cwd = input.cwd ?? process.cwd();
  const channels = CHANNEL_KEYS.map((channelKey) => buildChannelManifest(cwd, channelKey));
  return {
    version: "v041",
    required_image_count: channels.reduce((sum, channel) => sum + channel.files.length, 0),
    common_requirements: [
      "9:16 vertical",
      "photorealistic",
      "clean commerce ad style",
      "no text inside image",
      "no watermark",
      "no logo",
      "no UI",
      "no scary mood",
      "no abstract overlay",
      "no mosaic/checkerboard/noise",
      "min width 720",
      "min height 1280"
    ],
    forbidden_conditions: [
      "solid rectangle",
      "gradient panel",
      "color bar",
      "checkerboard",
      "mosaic noise",
      "CSS placeholder",
      "canvas placeholder",
      "sample fixture image",
      "raw URL in image"
    ],
    channels
  };
}

export function getV041ExpectedImagePaths(input: { cwd?: string } = {}) {
  return buildV041ManualImageDropManifest(input).channels.map((channel) => ({
    channel_key: channel.channel_key,
    expected_dir: channel.expected_dir,
    evidence_path: path.join(channel.expected_dir, channel.evidence_filename),
    files: channel.files.map((file) => ({
      scene_key: file.scene_key,
      filename: file.filename,
      path: file.path
    }))
  }));
}

function buildChannelManifest(cwd: string, channelKey: ChannelKey): ManualImageDropChannel {
  const profile = getChannelProfile(channelKey);
  const expectedDir = path.join(cwd, "commerce-assets", "manual-drop", "v041", channelKey);
  const requiredObjectGroups = getRequiredSceneObjectGroups(channelKey);

  return {
    channel_key: channelKey,
    product_name: CHANNEL_PRODUCT_NAMES[channelKey],
    expected_dir: expectedDir,
    evidence_filename: "manual-image-semantic-evidence.json",
    required_object_groups: requiredObjectGroups,
    files: CHANNEL_FILENAMES[channelKey].map((filename, index) => ({
      scene_key: `scene_${index + 1}`,
      filename,
      path: path.join(expectedDir, filename),
      prompt: [
        `Photorealistic vertical commerce Shorts image for ${profile.display_name}.`,
        `Product/context: ${CHANNEL_PRODUCT_NAMES[channelKey]}.`,
        `Required objects: ${requiredObjectGroups.map((group) => group.join(" or ")).join("; ")}.`,
        "Real-life lifestyle advertising frame, no text, no watermark, no placeholder pattern."
      ].join(" "),
      required_visuals: [
        "real photo-like lifestyle scene",
        "visible product or related object",
        "visible channel-specific context",
        "portrait 9:16 frame"
      ],
      forbidden_visuals: [
        "mosaic",
        "checkerboard",
        "noise texture",
        "abstract color grid",
        "solid or gradient placeholder",
        "raw URL",
        "watermark"
      ]
    }))
  };
}
