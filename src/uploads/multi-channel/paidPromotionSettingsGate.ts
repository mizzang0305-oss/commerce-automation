import { CHANNEL_KEYS } from "./channelProfiles";

export const V049_PAID_PROMOTION_CONFIRMATION_PHRASE =
  "CONFIRM_V049_PAID_PROMOTION_SETTINGS_CHECKED_FOR_ALL_CHANNELS";

export type V049PaidPromotionGate = {
  paid_promotion_required_all: boolean;
  paid_promotion_setting_verified: boolean;
  manual_paid_promotion_check_required: boolean;
  manual_paid_promotion_confirmation_present: boolean;
  blocker: "MANUAL_PAID_PROMOTION_CHECK_REQUIRED" | null;
};

export function evaluateV049PaidPromotionGate(input: {
  approvalText?: string;
} = {}): V049PaidPromotionGate {
  const manualConfirmationPresent = String(input.approvalText ?? "")
    .includes(V049_PAID_PROMOTION_CONFIRMATION_PHRASE);
  const requiredAll = CHANNEL_KEYS.length === 3;

  return {
    paid_promotion_required_all: requiredAll,
    paid_promotion_setting_verified: requiredAll && manualConfirmationPresent,
    manual_paid_promotion_check_required: requiredAll && !manualConfirmationPresent,
    manual_paid_promotion_confirmation_present: manualConfirmationPresent,
    blocker: requiredAll && !manualConfirmationPresent
      ? "MANUAL_PAID_PROMOTION_CHECK_REQUIRED"
      : null
  };
}
