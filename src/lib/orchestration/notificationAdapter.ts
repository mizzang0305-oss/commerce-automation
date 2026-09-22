export type CommerceNotificationEvent = {
  event_type: "commerce.poc.review_ready";
  request_id: string;
  batch_id: string;
  review_passed: number;
  review_blocked: number;
  draft_ids: string[];
};

export type CommerceNotificationResult = {
  dispatched: boolean;
  adapter: string;
  blocker: string;
};

export interface CommerceNotificationAdapter {
  readonly name: string;
  send(event: CommerceNotificationEvent): Promise<CommerceNotificationResult>;
}

export class BlockedCommerceNotificationAdapter implements CommerceNotificationAdapter {
  readonly name = "blocked";

  async send(): Promise<CommerceNotificationResult> {
    return {
      dispatched: false,
      adapter: this.name,
      blocker: "NOTIFICATION_ADAPTER_NOT_CONFIGURED"
    };
  }
}
