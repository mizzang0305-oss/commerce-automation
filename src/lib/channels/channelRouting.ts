import type { ChannelProfile, ProductQueueItem } from "@/types/automation";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function includesAny(haystack: string, needles: string[]) {
  const normalizedHaystack = normalize(haystack);
  return needles.some((needle) => normalizedHaystack.includes(normalize(needle)));
}

function activeManualChannels(channels: ChannelProfile[]) {
  return channels.filter((channel) => channel.status === "active" && channel.manual_upload_only);
}

export function scoreQueueItemForChannel(item: ProductQueueItem, channel: ChannelProfile) {
  const searchable = [
    item.category_path,
    item.theme,
    item.keyword,
    item.product_name,
    channel.niche
  ].join(" ");

  if (includesAny(searchable, channel.excluded_categories)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (includesAny(item.category_path, channel.allowed_categories)) {
    score += 4;
  }
  if (includesAny(item.theme, channel.allowed_categories)) {
    score += 2;
  }
  if (includesAny(item.keyword, channel.allowed_categories)) {
    score += 1;
  }
  if (channel.default_hashtags.length > 0) {
    score += 0.5;
  }
  return score;
}

export function routeQueueItemToChannel(
  item: ProductQueueItem,
  channels: ChannelProfile[],
  preferredChannelId = ""
) {
  const manualChannels = activeManualChannels(channels);
  if (preferredChannelId) {
    return manualChannels.find((channel) => channel.id === preferredChannelId) ?? null;
  }

  return manualChannels
    .map((channel) => ({ channel, score: scoreQueueItemForChannel(item, channel) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score || a.channel.channel_name.localeCompare(b.channel.channel_name))[0]?.channel ?? null;
}

export function mergeChannelHashtags(contentHashtags: string, channel: ChannelProfile) {
  const tags = [
    ...contentHashtags.split(/\s+/),
    ...channel.default_hashtags
  ]
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));

  return Array.from(new Set(tags)).slice(0, 12).join(" ");
}
