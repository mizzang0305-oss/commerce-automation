import { type ChannelKey, getChannelProfile } from "./channelProfiles";

export const V037_SCENE_KEYS = [
  "scene_01_hook",
  "scene_02_problem",
  "scene_03_buying_check_1",
  "scene_04_buying_check_2",
  "scene_05_product_use",
  "scene_06_comparison",
  "scene_07_comment_cta"
] as const;

export type V037SceneKey = typeof V037_SCENE_KEYS[number];

export type V037ScenePrompt = {
  scene_key: V037SceneKey;
  scene_number: number;
  duration_seconds: number;
  purpose: string;
  prompt: string;
  image_filename: string;
  required_visuals: string[];
  forbidden_visuals: string[];
};

export type V037ChannelScenePromptPlan = {
  version: "v037";
  channel_key: ChannelKey;
  product_name: string;
  common_constraints: string[];
  scenes: V037ScenePrompt[];
};

const COMMON_IMAGE_CONSTRAINTS = [
  "photorealistic",
  "clean commerce ad style",
  "9:16 vertical",
  "no text inside image",
  "no watermark",
  "no logo",
  "no UI",
  "no scary mood",
  "no abstract overlay",
  "safe subtitle space"
];

const CHANNEL_VISUAL_CONTEXT: Record<ChannelKey, {
  identity: string;
  hook: string;
  problem: string;
  checkOne: string;
  checkTwo: string;
  use: string;
  comparison: string;
  cta: string;
}> = {
  father_jobs: {
    identity: "실용 작업, 차량, 공구, 집안 정리 중심",
    hook: "차량 컵홀더 주변이 지저분한 출근 전 상황",
    problem: "운전 중 작은 물건이 흩어져 불편한 차량 실내",
    checkOne: "컵 사이즈와 고정력 체크 장면",
    checkTwo: "보관 칸과 꺼내기 쉬운 위치 체크 장면",
    use: "차량 안에서 컵홀더 정리함을 실제로 배치한 장면",
    comparison: "정리 전후 차량 콘솔 비교",
    cta: "차량 실내를 깨끗하게 정리한 제품 중심 장면"
  },
  neoman_moleulgeol: {
    identity: "생활 문제, 장마철, 실내 건조, 작은 공간 중심",
    hook: "비 오는 날 실내 빨래가 잘 마르지 않는 문제",
    problem: "좁은 방에서 빨래와 습기가 쌓이는 생활 장면",
    checkOne: "건조대 크기와 방 안 동선 체크 장면",
    checkTwo: "하중과 접었을 때 보관 공간 체크 장면",
    use: "접이식 빨래건조대에 수건과 옷을 널어둔 장면",
    comparison: "정리 전후 실내 건조 공간 비교",
    cta: "깔끔하게 접어 보관한 건조대와 생활 공간"
  },
  lets_buy: {
    identity: "가성비, 비교, 특가, 구매 조건 중심",
    hook: "케이블이 엉킨 책상 위에서 가격보다 조건을 보는 장면",
    problem: "충전 케이블과 액세서리가 섞인 책상 정리 문제",
    checkOne: "케이블 길이와 수납 칸 개수 체크 장면",
    checkTwo: "책상 위 크기와 내구성 비교 장면",
    use: "케이블 정리함으로 책상이 정리된 사용 장면",
    comparison: "정리 전후 책상 위 비교",
    cta: "가성비 제품을 깔끔하게 보여주는 최종 장면"
  }
};

export function buildChannelScenePromptPlan(input: {
  channel_key: ChannelKey;
  product_name: string;
}): V037ChannelScenePromptPlan {
  const profile = getChannelProfile(input.channel_key);
  const context = CHANNEL_VISUAL_CONTEXT[input.channel_key];
  const base = `${input.product_name}, ${profile.display_name}, ${context.identity}`;

  return {
    version: "v037",
    channel_key: input.channel_key,
    product_name: input.product_name,
    common_constraints: [...COMMON_IMAGE_CONSTRAINTS],
    scenes: [
      scene(input.channel_key, 1, "scene_01_hook", "강한 첫 장면", `${base}, ${context.hook}, close practical commerce framing`),
      scene(input.channel_key, 2, "scene_02_problem", "문제 공감", `${base}, ${context.problem}, everyday inconvenience before purchase`),
      scene(input.channel_key, 3, "scene_03_buying_check_1", "구매 전 체크포인트 1", `${base}, ${context.checkOne}, clear product scale`),
      scene(input.channel_key, 4, "scene_04_buying_check_2", "구매 전 체크포인트 2", `${base}, ${context.checkTwo}, clean checklist-friendly composition without text`),
      scene(input.channel_key, 5, "scene_05_product_use", "제품 사용 장면", `${base}, ${context.use}, realistic object placement`),
      scene(input.channel_key, 6, "scene_06_comparison", "비교 또는 결과", `${base}, ${context.comparison}, before after layout with no embedded text`),
      scene(input.channel_key, 7, "scene_07_comment_cta", "댓글 링크 CTA", `${base}, ${context.cta}, final product hero frame with subtitle safe area`)
    ]
  };
}

function scene(
  channelKey: ChannelKey,
  sceneNumber: number,
  sceneKey: V037SceneKey,
  purpose: string,
  prompt: string
): V037ScenePrompt {
  return {
    scene_key: sceneKey,
    scene_number: sceneNumber,
    duration_seconds: sceneNumber === 1 ? 2.5 : 3,
    purpose,
    prompt,
    image_filename: `${String(sceneNumber).padStart(2, "0")}-${sceneKey.replace("scene_", "")}.png`,
    required_visuals: requiredVisuals(channelKey),
    forbidden_visuals: [
      "text inside image",
      "watermark",
      "logo",
      "UI screenshot",
      "scary mood",
      "abstract overlay",
      "medical or health claim"
    ]
  };
}

function requiredVisuals(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") return ["vehicle or work utility context", "practical product placement", "clear storage/use case"];
  if (channelKey === "lets_buy") return ["comparison-friendly product view", "value-check setup", "clean desk or compact product context"];
  return ["everyday home problem", "small-space lifestyle context", "clear household use case"];
}
