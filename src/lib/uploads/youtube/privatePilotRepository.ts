import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import type { AuthoritativePrivatePilotBinding } from "@/lib/uploads/youtube/authoritativePrivatePilotBinding";

export type PrivatePilotOwnerApproval = {
  approval_id: string;
  upload_package_id: string;
  product_candidate_id: string;
  video_asset_id: string;
  video_checksum_sha256: string;
  status: "approved" | "consumed" | "expired" | "revoked";
  approved_at: string;
  expires_at: string;
  consumed_at: string;
};

export type PrivatePilotReservationStore = {
  reserve(input: {
    uploadPackageId: string;
    approvalId: string;
    approvalNonce: string;
  }): Promise<
    | { reserved: true; reservationId: string }
    | { reserved: false; blocker: string }
  >;
  markExternalCallStarted(reservationId: string): Promise<boolean>;
  markFailedBeforeExternalCall(reservationId: string, failureCode: string): Promise<boolean>;
  markHumanReviewRequired(reservationId: string, failureCode: string): Promise<boolean>;
  complete(
    reservationId: string,
    result: { videoIdSha256Prefix: string; videoUrlSha256Prefix: string }
  ): Promise<boolean>;
};

export class SupabasePrivatePilotRepository implements PrivatePilotReservationStore {
  constructor(private readonly client: SupabaseClient = getSupabaseAdminClient()) {}

  async createOwnerApproval(input: {
    binding: AuthoritativePrivatePilotBinding;
    expiresInSeconds: number;
  }): Promise<{ approval: PrivatePilotOwnerApproval; approvalNonce: string }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.expiresInSeconds * 1000);
    const approvalId = `ppa-${randomUUID()}`;
    const approvalNonce = randomBytes(32).toString("hex");
    const nonceSha256 = createHash("sha256").update(approvalNonce, "utf8").digest("hex");
    const checksum = input.binding.preparedVideoAsset.checksum_sha256 ?? "";
    const row = {
      approval_id: approvalId,
      upload_package_id: input.binding.uploadPackage.id,
      product_candidate_id: input.binding.candidate.id,
      video_asset_id: input.binding.videoAsset.id,
      video_checksum_sha256: checksum,
      nonce_sha256: nonceSha256,
      status: "approved",
      approved_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      consumed_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };
    const { data, error } = await this.client
      .from("private_pilot_owner_approvals")
      .insert(row)
      .select(
        "approval_id,upload_package_id,product_candidate_id,video_asset_id,video_checksum_sha256,status,approved_at,expires_at,consumed_at"
      )
      .single();
    if (error || !data) throw new Error("OWNER_APPROVAL_PERSISTENCE_FAILED");
    return {
      approval: normalizeApproval(data as Record<string, unknown>),
      approvalNonce
    };
  }

  async getOwnerApproval(approvalId: string): Promise<PrivatePilotOwnerApproval | null> {
    const { data, error } = await this.client
      .from("private_pilot_owner_approvals")
      .select(
        "approval_id,upload_package_id,product_candidate_id,video_asset_id,video_checksum_sha256,status,approved_at,expires_at,consumed_at"
      )
      .eq("approval_id", approvalId)
      .maybeSingle();
    if (error) throw new Error("OWNER_APPROVAL_LOOKUP_FAILED");
    return data ? normalizeApproval(data as Record<string, unknown>) : null;
  }

  async reserve(input: { uploadPackageId: string; approvalId: string; approvalNonce: string }) {
    const reservationId = `ppr-${randomUUID()}`;
    const { data, error } = await this.client.rpc("reserve_private_pilot_upload", {
      p_reservation_id: reservationId,
      p_upload_package_id: input.uploadPackageId,
      p_approval_id: input.approvalId,
      p_nonce_sha256: createHash("sha256").update(input.approvalNonce, "utf8").digest("hex")
    });
    if (error) return { reserved: false as const, blocker: "PRIVATE_UPLOAD_RESERVATION_FAILED" };
    const result = record(data);
    return result.reserved === true
      ? { reserved: true as const, reservationId }
      : {
          reserved: false as const,
          blocker: safeBlocker(result.blocker, "PRIVATE_UPLOAD_RESERVATION_FAILED")
        };
  }

  async markExternalCallStarted(reservationId: string) {
    return this.booleanRpc("mark_private_pilot_external_call_started", {
      p_reservation_id: reservationId
    });
  }

  async markFailedBeforeExternalCall(reservationId: string, failureCode: string) {
    return this.booleanRpc("mark_private_pilot_failed_before_external_call", {
      p_reservation_id: reservationId,
      p_failure_code: safeBlocker(failureCode, "PRE_EXTERNAL_TRANSITION_FAILED")
    });
  }

  async markHumanReviewRequired(reservationId: string, failureCode: string) {
    return this.booleanRpc("mark_private_pilot_human_review_required", {
      p_reservation_id: reservationId,
      p_failure_code: safeBlocker(failureCode, "HUMAN_REVIEW_REQUIRED")
    });
  }

  async complete(
    reservationId: string,
    result: { videoIdSha256Prefix: string; videoUrlSha256Prefix: string }
  ) {
    return this.booleanRpc("complete_private_pilot_upload", {
      p_reservation_id: reservationId,
      p_video_id_sha256_prefix: result.videoIdSha256Prefix,
      p_video_url_sha256_prefix: result.videoUrlSha256Prefix
    });
  }

  private async booleanRpc(name: string, params: Record<string, unknown>) {
    const { data, error } = await this.client.rpc(name, params);
    if (error) return false;
    return data === true;
  }
}

function normalizeApproval(row: Record<string, unknown>): PrivatePilotOwnerApproval {
  const status = String(row.status);
  if (!["approved", "consumed", "expired", "revoked"].includes(status)) {
    throw new Error("OWNER_APPROVAL_RECORD_INVALID");
  }
  return {
    approval_id: String(row.approval_id ?? ""),
    upload_package_id: String(row.upload_package_id ?? ""),
    product_candidate_id: String(row.product_candidate_id ?? ""),
    video_asset_id: String(row.video_asset_id ?? ""),
    video_checksum_sha256: String(row.video_checksum_sha256 ?? ""),
    status: status as PrivatePilotOwnerApproval["status"],
    approved_at: String(row.approved_at ?? ""),
    expires_at: String(row.expires_at ?? ""),
    consumed_at: String(row.consumed_at ?? "")
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeBlocker(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[A-Z0-9_]{1,80}$/.test(text) ? text : fallback;
}
