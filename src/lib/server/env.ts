export type N8nWebhookType =
  | "nightly_scout"
  | "next_batch"
  | "retry_item"
  | "hold_item"
  | "skip_item";

export type N8nConfigStatus = {
  nightlyScoutConfigured: boolean;
  nextBatchConfigured: boolean;
  retryItemConfigured: boolean;
  holdItemConfigured: boolean;
  skipItemConfigured: boolean;
  secretConfigured: boolean;
  callbackBaseUrlConfigured: boolean;
  callbackSecretConfigured: boolean;
};

export function getN8nConfigStatus(): N8nConfigStatus {
  return {
    nightlyScoutConfigured: Boolean(process.env.N8N_NIGHTLY_SCOUT_WEBHOOK_URL),
    nextBatchConfigured: Boolean(process.env.N8N_NEXT_BATCH_WEBHOOK_URL),
    retryItemConfigured: Boolean(process.env.N8N_RETRY_ITEM_WEBHOOK_URL),
    holdItemConfigured: Boolean(process.env.N8N_HOLD_ITEM_WEBHOOK_URL),
    skipItemConfigured: Boolean(process.env.N8N_SKIP_ITEM_WEBHOOK_URL),
    secretConfigured: Boolean(process.env.N8N_WEBHOOK_SECRET),
    callbackBaseUrlConfigured: Boolean(process.env.PUBLIC_APP_BASE_URL),
    callbackSecretConfigured: Boolean(process.env.COMMERCE_AUTOMATION_API_SECRET)
  };
}

export function getN8nWebhookUrl(type: N8nWebhookType): string | undefined {
  const map: Record<N8nWebhookType, string | undefined> = {
    nightly_scout: process.env.N8N_NIGHTLY_SCOUT_WEBHOOK_URL,
    next_batch: process.env.N8N_NEXT_BATCH_WEBHOOK_URL,
    retry_item: process.env.N8N_RETRY_ITEM_WEBHOOK_URL,
    hold_item: process.env.N8N_HOLD_ITEM_WEBHOOK_URL,
    skip_item: process.env.N8N_SKIP_ITEM_WEBHOOK_URL
  };

  return map[type];
}
