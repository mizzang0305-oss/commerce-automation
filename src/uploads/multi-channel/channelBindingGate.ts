import { type V035ChannelPlan } from "./v035PipelineAdapter";
import { getV048ChannelSpec } from "./channelSpecificScriptFactory";

export type ChannelBindingReport = {
  channel_key: string;
  channel_script_binding_pass: boolean;
  channel_scene_manifest_binding_pass: boolean;
  channel_metadata_binding_pass: boolean;
  channel_comment_binding_pass: boolean;
  channel_asr_anchor_binding_pass: boolean;
  forbidden_script_terms_found: string[];
  forbidden_scene_terms_found: string[];
  required_core_anchors: string[];
  missing_core_anchors: string[];
  binding_blocker: string | null;
};

export type ThreeChannelBindingReport = {
  channel_script_binding_pass: boolean;
  channel_scene_manifest_binding_pass: boolean;
  channel_metadata_binding_pass: boolean;
  channel_comment_binding_pass: boolean;
  channel_asr_anchor_binding_pass: boolean;
  cross_channel_text_contamination: boolean;
  same_script_reused: boolean;
  same_scene_manifest_reused: boolean;
  same_metadata_title_reused: boolean;
  same_comment_first_line_reused: boolean;
  binding_blocker: string | null;
  channels: ChannelBindingReport[];
};

export function evaluateChannelBinding(plan: V035ChannelPlan): ChannelBindingReport {
  const spec = getV048ChannelSpec(plan.channel_key);
  const scriptText = normalize(plan.script);
  const sceneText = normalize(plan.scene_prompt_plan.map((scene) => `${scene.scene_key} ${scene.purpose}`).join(" "));
  const metadataTitle = normalize(plan.metadata_title);
  const commentFirstLine = normalize(plan.comment_first_line);
  const forbiddenScriptTerms = spec.forbidden_keywords.filter((term) =>
    textContainsForbiddenTerm(scriptText, term, spec.channel_key));
  const forbiddenSceneTerms = spec.forbidden_keywords.filter((term) =>
    textContainsForbiddenTerm(sceneText, term, spec.channel_key));
  const missingCoreAnchors = spec.core_anchors.filter((anchor) => !scriptText.includes(normalize(anchor)));
  const channelScriptBindingPass =
    forbiddenScriptTerms.length === 0 &&
    spec.allowed_keywords.some((term) => scriptText.includes(normalize(term))) &&
    missingCoreAnchors.length === 0;
  const channelSceneManifestBindingPass =
    forbiddenSceneTerms.length === 0 &&
    plan.scene_prompt_plan.length === 6 &&
    plan.scene_prompt_plan.every((scene, index) => scene.scene_key === spec.scene_prompt_plan[index]?.scene_key &&
      normalize(scene.purpose) === normalize(spec.scene_prompt_plan[index]?.purpose));
  const channelMetadataBindingPass = metadataTitle === normalize(spec.metadata_title);
  const channelCommentBindingPass = commentFirstLine === normalize(spec.comment_first_line);
  const channelAsrAnchorBindingPass = missingCoreAnchors.length === 0;
  const blocker =
    !channelScriptBindingPass ? "CHANNEL_SCRIPT_BINDING_FAIL" :
      !channelSceneManifestBindingPass ? "CHANNEL_SCENE_MANIFEST_BINDING_FAIL" :
        !channelMetadataBindingPass ? "CHANNEL_METADATA_BINDING_FAIL" :
          !channelCommentBindingPass ? "CHANNEL_COMMENT_BINDING_FAIL" :
            !channelAsrAnchorBindingPass ? "CHANNEL_ASR_ANCHOR_BINDING_FAIL" :
              null;

  return {
    channel_key: plan.channel_key,
    channel_script_binding_pass: channelScriptBindingPass,
    channel_scene_manifest_binding_pass: channelSceneManifestBindingPass,
    channel_metadata_binding_pass: channelMetadataBindingPass,
    channel_comment_binding_pass: channelCommentBindingPass,
    channel_asr_anchor_binding_pass: channelAsrAnchorBindingPass,
    forbidden_script_terms_found: forbiddenScriptTerms,
    forbidden_scene_terms_found: forbiddenSceneTerms,
    required_core_anchors: spec.core_anchors,
    missing_core_anchors: missingCoreAnchors,
    binding_blocker: blocker
  };
}

export function evaluateThreeChannelBinding(plans: V035ChannelPlan[]): ThreeChannelBindingReport {
  const channels = plans.map(evaluateChannelBinding);
  const sameScriptReused = hasDuplicates(plans.map((plan) => normalize(plan.script)));
  const sameSceneManifestReused = hasDuplicates(plans.map((plan) =>
    normalize(plan.scene_prompt_plan.map((scene) => `${scene.scene_key}:${scene.purpose}`).join("|"))));
  const sameMetadataTitleReused = hasDuplicates(plans.map((plan) => normalize(plan.metadata_title)));
  const sameCommentFirstLineReused = hasDuplicates(plans.map((plan) => normalize(plan.comment_first_line)));
  const crossChannelTextContamination = channels.some((channel) =>
    channel.forbidden_script_terms_found.length > 0 || channel.forbidden_scene_terms_found.length > 0);
  const firstBlocker = channels.find((channel) => channel.binding_blocker)?.binding_blocker ?? null;
  const blocker =
    sameScriptReused ? "SAME_SCRIPT_REUSED_ACROSS_CHANNELS" :
      sameSceneManifestReused ? "ALL_CHANNELS_USED_SAME_SCENE_PURPOSES" :
        sameMetadataTitleReused ? "CHANNEL_METADATA_BINDING_FAIL" :
          sameCommentFirstLineReused ? "CHANNEL_COMMENT_BINDING_FAIL" :
            crossChannelTextContamination ? "CROSS_CHANNEL_TEXT_CONTAMINATION" :
              firstBlocker;

  return {
    channel_script_binding_pass: channels.every((channel) => channel.channel_script_binding_pass),
    channel_scene_manifest_binding_pass: channels.every((channel) => channel.channel_scene_manifest_binding_pass),
    channel_metadata_binding_pass: channels.every((channel) => channel.channel_metadata_binding_pass),
    channel_comment_binding_pass: channels.every((channel) => channel.channel_comment_binding_pass),
    channel_asr_anchor_binding_pass: channels.every((channel) => channel.channel_asr_anchor_binding_pass),
    cross_channel_text_contamination: crossChannelTextContamination,
    same_script_reused: sameScriptReused,
    same_scene_manifest_reused: sameSceneManifestReused,
    same_metadata_title_reused: sameMetadataTitleReused,
    same_comment_first_line_reused: sameCommentFirstLineReused,
    binding_blocker: blocker,
    channels
  };
}

function textContainsForbiddenTerm(text: string, term: string, channelKey: string) {
  const normalizedTerm = normalize(term);
  if (channelKey === "father_jobs" && normalizedTerm === "케이블" && text.includes("충전 케이블")) {
    return false;
  }
  return text.includes(normalizedTerm);
}

function hasDuplicates(values: string[]) {
  return new Set(values).size !== values.length;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}
