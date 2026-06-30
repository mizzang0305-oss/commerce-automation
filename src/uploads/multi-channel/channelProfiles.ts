export const CHANNEL_KEYS = ["father_jobs", "neoman_moleulgeol", "lets_buy"] as const;

export type ChannelKey = typeof CHANNEL_KEYS[number];

export type ChannelProfile = {
  channel_key: ChannelKey;
  display_name: string;
  positioning: string;
  tone: string;
  target_viewer: string[];
  best_categories: string[];
  avoid_categories: string[];
  hook_openers: string[];
  title_style_terms: string[];
  comment_first_line: string;
  scene_tone: string[];
};

const CHANNEL_PROFILES: Record<ChannelKey, ChannelProfile> = {
  father_jobs: {
    channel_key: "father_jobs",
    display_name: "father jobs",
    positioning: "Dad, worker, driver, and household practical gear",
    tone: "field-tested, practical, plain-spoken",
    target_viewer: ["30s men", "40s men", "drivers", "office workers", "field workers", "home repair buyers"],
    best_categories: [
      "vehicle accessories",
      "tools",
      "organizers",
      "office utility",
      "body protection",
      "work safety",
      "camping and car camping",
      "household utility"
    ],
    avoid_categories: ["women beauty", "decor-only interior", "children toys", "purely emotional goods"],
    hook_openers: [
      "If this is missing from your car, the commute gets annoying fast.",
      "Before you buy it, check the size, load, and storage first.",
      "This is the kind of tool that makes a difference once work starts.",
      "A small setup change can make the whole job easier.",
      "If your home chores keep piling up, check this first."
    ],
    title_style_terms: ["practical", "tool", "work", "storage", "checklist"],
    comment_first_line: "\uC9D1\uC548\uC77C\uC744 \uC904\uC774\uB824\uBA74 \uD06C\uAE30\u00B7\uD558\uC911\u00B7\uBCF4\uAD00\uACF5\uAC04\uC744 \uBA3C\uC800 \uD655\uC778\uD558\uC138\uC694.",
    scene_tone: ["practical home use", "work-ready composition", "restrained family context", "clear utility close-up"]
  },
  neoman_moleulgeol: {
    channel_key: "neoman_moleulgeol",
    display_name: "\uB108\uB9CC\uBAA8\uB97C\uAC78",
    positioning: "Useful life hacks people lose time or money by missing",
    tone: "curious, quick, mistake-prevention focused",
    target_viewer: ["20s", "30s", "40s", "one-person households", "homemakers", "office workers"],
    best_categories: [
      "life hack",
      "cleaning",
      "storage",
      "kitchen",
      "bathroom",
      "seasonal",
      "humidity and drying",
      "small-space utility"
    ],
    avoid_categories: ["specialized trade tools", "high-end electronics", "long explanation products"],
    hook_openers: [
      "If you do not know this, you may keep living with the same inconvenience.",
      "Rainy-day laundry smell keeps coming back for a reason.",
      "Before buying, check these three points first.",
      "Small rooms need the storage check before the price check.",
      "Most people miss this until the first rainy week."
    ],
    title_style_terms: ["life hack", "mistake prevention", "check first", "rainy season", "small room"],
    comment_first_line: "\uC7A5\uB9C8\uCCA0 \uC2E4\uB0B4\uAC74\uC870 \uACE0\uBBFC\uC774\uB77C\uBA74 \uD06C\uAE30\u00B7\uD558\uC911\u00B7\uBCF4\uAD00\uACF5\uAC04\uC744 \uBA3C\uC800 \uD655\uC778\uD558\uC138\uC694.",
    scene_tone: ["life-hack framing", "clear everyday problem", "easy-to-read before state", "small-space home context"]
  },
  lets_buy: {
    channel_key: "lets_buy",
    display_name: "\uC774\uAC74 \uC0B4\uAE4C\uBD10",
    positioning: "Value, comparison, and deal-check commerce channel",
    tone: "review-like, comparison-first, value-check focused",
    target_viewer: ["value shoppers", "deal hunters", "comparison buyers", "new product explorers"],
    best_categories: [
      "value deal",
      "sale item",
      "Coupang deal",
      "daily tech",
      "electronics accessory",
      "small kitchen appliance",
      "new idea product",
      "comparison-friendly product"
    ],
    avoid_categories: ["needs firsthand proof claims", "hard-to-verify safety product", "medical or health claim product"],
    hook_openers: [
      "At this price, check whether it is actually worth buying.",
      "Before the deal ends, compare these conditions first.",
      "Cheap is not enough; check the size and durability.",
      "This is a value check, not a fake usage review.",
      "The price looks good, but these conditions decide it."
    ],
    title_style_terms: ["value", "deal", "compare", "worth it", "check"],
    comment_first_line: "\uBE44\uC2B7\uD55C \uC81C\uD488\uC774\uB77C\uB3C4 \uD06C\uAE30\u00B7\uD558\uC911\u00B7\uBCF4\uAD00\uC131\uC744 \uAF2D \uBE44\uAD50\uD574\uBCF4\uC138\uC694.",
    scene_tone: ["comparison layout", "before-after structure", "condition checklist", "value-focused product close-up"]
  }
};

export function getChannelProfileRegistry() {
  return CHANNEL_PROFILES;
}

export function getChannelProfiles(): ChannelProfile[] {
  return CHANNEL_KEYS.map((key) => CHANNEL_PROFILES[key]);
}

export function getChannelProfile(channelKey: ChannelKey): ChannelProfile {
  return CHANNEL_PROFILES[channelKey];
}

export function isChannelKey(value: unknown): value is ChannelKey {
  return typeof value === "string" && CHANNEL_KEYS.includes(value as ChannelKey);
}
