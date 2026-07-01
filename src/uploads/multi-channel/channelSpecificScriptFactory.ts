import { type ChannelKey } from "./channelProfiles";
import { type V035ChannelPlan } from "./v035PipelineAdapter";

export type V048ChannelSpec = {
  channel_key: ChannelKey;
  product_name: string;
  forbidden_keywords: string[];
  allowed_keywords: string[];
  script: string;
  scene_prompt_plan: Array<{
    scene_key: string;
    prompt: string;
    purpose: string;
    subtitle: string;
  }>;
  metadata_title: string;
  comment_first_line: string;
  core_anchors: string[];
};

export const V048_CHANNEL_SPECS: V048ChannelSpec[] = [
  {
    channel_key: "father_jobs",
    product_name: "차량용 컵홀더 정리함",
    forbidden_keywords: ["빨래", "건조대", "장마철", "습기", "실내건조", "케이블", "책상"],
    allowed_keywords: ["차량", "컵홀더", "콘솔", "정리함", "수납", "출근길", "운전"],
    script: [
      "차 안이 지저분하면 작은 정리함 하나가 출근길을 바꿉니다.",
      "컵홀더와 콘솔에 물건이 쌓이면 운전할 때 은근히 불편합니다.",
      "차량용 컵홀더 정리함은 충전 케이블, 키, 카드 같은 작은 물건을 나누어 보관하는 데 도움이 됩니다.",
      "구매 전에는 차 컵홀더 크기, 고정 방식, 수납칸 구성을 먼저 확인하세요.",
      "상품 구성과 가격은 댓글 링크에서 확인하세요."
    ].join(" "),
    scene_prompt_plan: [
      scene("01-car-messy-cup-holder", "Messy car cup holder with small daily items.", "차 컵홀더가 지저분한 문제", "차 안 컵홀더부터 정리"),
      scene("02-car-console-clutter", "Cluttered car console storage problem.", "차량 콘솔 수납 문제", "콘솔 수납이 불편할 때"),
      scene("03-organizer-product-reveal", "Car cup holder organizer product reveal.", "차량용 정리함 등장", "차량용 정리함 확인"),
      scene("04-driver-organizing-items", "Driver organizing keys cards and small items.", "운전자가 작은 물건을 정리하는 장면", "작은 물건을 나누어 보관"),
      scene("05-clean-car-console-after", "Clean car console after organizing.", "정리 후 깨끗한 차량 콘솔", "정리 후 콘솔이 깔끔하게"),
      scene("06-car-dashboard-cta", "Car dashboard CTA for organizer size check.", "차량용 정리함 CTA", "크기와 수납칸 먼저 확인")
    ],
    metadata_title: "실용 체크 - 차량용 컵홀더 정리함",
    comment_first_line: "집안일 줄이듯 차 안도 크기·수납공간 먼저 확인하세요.",
    core_anchors: ["차량", "컵홀더", "정리함"]
  },
  {
    channel_key: "neoman_moleulgeol",
    product_name: "접이식 빨래건조대",
    forbidden_keywords: ["차량", "컵홀더", "콘솔", "케이블", "책상", "USB"],
    allowed_keywords: ["빨래", "건조대", "장마철", "습기", "공간", "실내건조", "수건", "양말"],
    script: [
      "생활 속 불편, 장마철 빨래는 건조 조건부터 봐야 합니다.",
      "비 오는 날에는 빨래가 늦게 마르고 실내 습기가 남을 수 있습니다.",
      "접이식 빨래건조대는 좁은 공간에서도 빨래를 펼쳐 말리는 데 도움이 됩니다.",
      "구매 전에는 크기, 하중, 접었을 때 보관 공간을 꼭 확인하세요.",
      "상품 구성과 가격은 댓글 링크에서 확인하세요."
    ].join(" "),
    scene_prompt_plan: [
      scene("01-rain-window-laundry-problem", "Rainy window laundry drying problem.", "장마철 비 오는 날 빨래 문제", "장마철 빨래가 늦게 마를 때"),
      scene("02-wet-laundry-slow-dry", "Wet laundry and humidity problem.", "젖은 빨래와 습기 문제", "습기가 남는 실내건조"),
      scene("03-small-room-laundry-mess", "Small room lacks laundry drying space.", "좁은 공간의 빨래 널 자리 부족", "좁은 공간도 먼저 확인"),
      scene("04-drying-rack-solution-reveal", "Foldable drying rack solution reveal.", "접이식 빨래건조대 해결책 등장", "접이식 빨래건조대 확인"),
      scene("05-laundry-use-case-human-hands", "Hands hanging towels and socks on rack.", "수건과 양말을 건조대에 널기", "수건과 양말을 널기"),
      scene("06-organized-indoor-drying-result", "Organized indoor drying result.", "정리된 실내건조 결과", "보관공간까지 체크")
    ],
    metadata_title: "생활꿀팁 - 접이식 빨래건조대",
    comment_first_line: "장마철 실내건조 고민이면 크기·하중·보관공간 먼저 확인하세요.",
    core_anchors: ["빨래", "건조대", "공간"]
  },
  {
    channel_key: "lets_buy",
    product_name: "특가 케이블 정리함",
    forbidden_keywords: ["빨래", "건조대", "장마철", "습기", "차량", "컵홀더", "콘솔"],
    allowed_keywords: ["케이블", "정리함", "책상", "USB", "충전기", "클립", "선정리"],
    script: [
      "가격만 보고 사기 전에 케이블 정리 조건부터 비교하세요.",
      "책상 위 케이블이 엉키면 충전기와 작은 기기까지 지저분해 보입니다.",
      "케이블 정리함이나 클립은 자주 쓰는 선을 나누어 정리하는 데 도움이 됩니다.",
      "구매 전에는 케이블 개수, 책상 공간, 고정 방식을 먼저 확인하세요.",
      "상품 구성과 가격은 댓글 링크에서 확인하세요."
    ].join(" "),
    scene_prompt_plan: [
      scene("01-messy-desk-cables", "Messy desk cable problem.", "책상 위 케이블 엉킴 문제", "책상 위 케이블 정리"),
      scene("02-cable-clutter-closeup", "USB and charging cable clutter closeup.", "충전선/USB 케이블 정리 전 상태", "USB와 충전선을 나누어"),
      scene("03-cable-organizer-reveal", "Cable organizer or clip product reveal.", "케이블 정리함 또는 클립 등장", "케이블 정리함 확인"),
      scene("04-organized-desk-after", "Clean desk after cable organizing.", "케이블 정리 후 깔끔한 책상", "정리 후 깔끔한 책상"),
      scene("05-before-after-cable-setup", "Before and after cable setup comparison.", "케이블 정리 전후 비교", "전후 차이를 비교"),
      scene("06-clean-desk-cta", "Clean desk CTA for cable organizer.", "케이블 정리함 CTA", "개수와 고정 방식 체크")
    ],
    metadata_title: "가성비 비교 - 특가 케이블 정리함",
    comment_first_line: "비슷한 제품이라도 가격보다 먼저 확인할 포인트가 있습니다.",
    core_anchors: ["케이블", "정리함", "책상"]
  }
];

export function buildChannelSpecificScriptPlan(channelKey: ChannelKey): V035ChannelPlan {
  const spec = getV048ChannelSpec(channelKey);
  return {
    channel_key: spec.channel_key,
    product_name: spec.product_name,
    hook: spec.script.split(".")[0] ? `${spec.script.split(".")[0]}.` : spec.script,
    script: spec.script,
    core_anchors: spec.core_anchors,
    metadata_title: spec.metadata_title,
    comment_first_line: spec.comment_first_line,
    scene_prompt_plan: spec.scene_prompt_plan.map((item) => ({ ...item }))
  };
}

export function getV048ChannelSpec(channelKey: ChannelKey) {
  const spec = V048_CHANNEL_SPECS.find((item) => item.channel_key === channelKey);
  if (!spec) {
    throw new Error(`Unsupported v048 channel: ${channelKey}`);
  }
  return spec;
}

function scene(scene_key: string, prompt: string, purpose: string, subtitle: string) {
  return { scene_key, prompt, purpose, subtitle };
}
