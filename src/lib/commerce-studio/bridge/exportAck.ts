export type StudioExportAck = "accepted" | "duplicate";

export function parseStudioExportAck(value: unknown): StudioExportAck {
  if (typeof value === "object" && value !== null && "status" in value &&
      (value.status === "accepted" || value.status === "duplicate")) return value.status;
  throw new Error("STUDIO_EXPORT_DELIVERY_NOT_ACKNOWLEDGED");
}
