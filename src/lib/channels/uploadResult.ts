import type { ChannelUploadPackage, ChannelUploadPackageStatus } from "@/types/automation";

export type ManualUploadResultAction = "uploaded" | "skipped" | "needs_fix";

export type ManualUploadResultInput = {
  uploaded_url?: unknown;
  uploaded_by?: unknown;
  upload_notes?: unknown;
};

export type ManualUploadResultBuildResult =
  | { ok: true; package: ChannelUploadPackage }
  | { ok: false; status: number; message: string; missing_reasons: string[] };

const STATUS_BY_ACTION: Record<ManualUploadResultAction, ChannelUploadPackageStatus> = {
  uploaded: "uploaded",
  skipped: "skipped",
  needs_fix: "needs_fix"
};

export function buildManualUploadResultPackage(input: {
  currentPackage: ChannelUploadPackage;
  action: ManualUploadResultAction;
  body: ManualUploadResultInput;
  now?: string;
}): ManualUploadResultBuildResult {
  const currentPackage = normalizeChannelUploadPackage(input.currentPackage);
  const uploadedUrl = stringValue(input.body.uploaded_url);
  const uploadedBy = stringValue(input.body.uploaded_by);
  const uploadNotes = stringValue(input.body.upload_notes);
  const missingReasons: string[] = [];

  if (input.action === "uploaded" && !uploadedUrl) {
    missingReasons.push("uploaded_url");
  }

  if (missingReasons.length > 0) {
    return {
      ok: false,
      status: 400,
      message: "업로드 완료 처리에는 업로드 결과 URL이 필요합니다.",
      missing_reasons: missingReasons
    };
  }

  const status = STATUS_BY_ACTION[input.action];
  const now = input.now ?? new Date().toISOString();

  return {
    ok: true,
    package: {
      ...currentPackage,
      status,
      uploaded_url: uploadedUrl || currentPackage.uploaded_url,
      uploaded_at: input.action === "uploaded" ? now : currentPackage.uploaded_at,
      uploaded_by: uploadedBy || currentPackage.uploaded_by,
      upload_notes: uploadNotes || currentPackage.upload_notes,
      platform_upload_status: status,
      upload_enabled: false,
      manual_upload_only: true,
      updated_at: now
    }
  };
}

export function normalizeChannelUploadPackage(input: ChannelUploadPackage): ChannelUploadPackage {
  return {
    ...input,
    status: normalizeStatus(input.status),
    uploaded_url: input.uploaded_url ?? "",
    uploaded_at: input.uploaded_at ?? "",
    uploaded_by: input.uploaded_by ?? "",
    upload_notes: input.upload_notes ?? "",
    platform_upload_status: input.platform_upload_status || input.status || "manual_ready",
    upload_enabled: false,
    manual_upload_only: true
  };
}

function normalizeStatus(status: string): ChannelUploadPackageStatus {
  if (status === "uploaded" || status === "skipped" || status === "needs_fix") {
    return status;
  }
  return "manual_ready";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
