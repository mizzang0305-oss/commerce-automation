import { type ChannelKey } from "./channelProfiles";

export type SceneObjectRequirementResult = {
  channel_key: ChannelKey;
  required_scene_objects_detected: boolean;
  scene_context_visible: boolean;
  product_or_related_object_visible: boolean;
  matched_required_objects: string[];
  missing_required_groups: string[];
  blockers: string[];
};

const REQUIRED_OBJECT_GROUPS: Record<ChannelKey, string[][]> = {
  father_jobs: [
    ["car interior", "vehicle interior", "driver seat"],
    ["cup holder", "console"],
    ["organizer", "storage object"],
    ["messy-to-clean context", "messy car", "clean car"]
  ],
  neoman_moleulgeol: [
    ["laundry", "clothes", "towels", "socks"],
    ["drying rack"],
    ["indoor room", "rainy window", "small room"],
    ["clothes", "towels", "socks"]
  ],
  lets_buy: [
    ["desk", "work desk"],
    ["cables", "cable clutter"],
    ["cable organizer", "cable clips"],
    ["before/after cable clutter context", "before after cable"]
  ]
};

const CONTEXT_GROUP_INDEX = 2;
const PRODUCT_GROUP_INDEX = 1;

export function validateSceneObjectRequirements(input: {
  channel_key: ChannelKey;
  detected_objects: string[];
}): SceneObjectRequirementResult {
  const normalizedObjects = input.detected_objects.map(normalize);
  const groups = REQUIRED_OBJECT_GROUPS[input.channel_key];
  const matched = groups.map((terms) =>
    terms.find((term) => normalizedObjects.some((object) => object.includes(normalize(term))))
  );
  const missingRequiredGroups = groups
    .map((terms, index) => ({ terms, index }))
    .filter((group) => !matched[group.index])
    .map((group) => group.terms.join(" or "));
  const requiredSceneObjectsDetected = missingRequiredGroups.length === 0;
  const sceneContextVisible = Boolean(matched[CONTEXT_GROUP_INDEX]);
  const productOrRelatedObjectVisible = Boolean(matched[PRODUCT_GROUP_INDEX]);
  const blockers: string[] = [];

  if (!requiredSceneObjectsDetected) blockers.push("REQUIRED_SCENE_OBJECTS_MISSING");
  if (!sceneContextVisible) blockers.push("SCENE_CONTEXT_NOT_VISIBLE");
  if (!productOrRelatedObjectVisible) blockers.push("NO_PRODUCT_OR_CONTEXT_OBJECT_VISIBLE");

  return {
    channel_key: input.channel_key,
    required_scene_objects_detected: requiredSceneObjectsDetected,
    scene_context_visible: sceneContextVisible,
    product_or_related_object_visible: productOrRelatedObjectVisible,
    matched_required_objects: matched.filter((item): item is string => Boolean(item)),
    missing_required_groups: missingRequiredGroups,
    blockers
  };
}

export function getRequiredSceneObjectGroups(channelKey: ChannelKey): string[][] {
  return REQUIRED_OBJECT_GROUPS[channelKey];
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
