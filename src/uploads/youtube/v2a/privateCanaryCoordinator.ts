import {
  buildV2AAmbiguousMarker,
  buildV2AIdempotencyKey,
  buildV2APrivateUploadReceipt,
  type V2AAmbiguousMarker,
  type V2AIdempotencyStatus,
  type V2APrivateUploadReceipt,
  type V2AUploadState
} from "./idempotencyReceipt";

export const APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD = "APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD" as const;
export const APPROVE_YOUTUBE_DAILY69_PRIVATE_AUTOMATION = "APPROVE_YOUTUBE_DAILY69_PRIVATE_AUTOMATION" as const;
export const APPROVE_YOUTUBE_PUBLIC_AUTOMATION = "APPROVE_YOUTUBE_PUBLIC_AUTOMATION" as const;

export type V2ACanaryRuntimeFlags = {
  YOUTUBE_UPLOAD_ENABLED: boolean;
  YOUTUBE_AUTO_UPLOAD: boolean;
  YOUTUBE_PUBLIC_UPLOAD_ENABLED: boolean;
  YOUTUBE_PUBLICATION_ENABLED: boolean;
  SAFE_TO_UPLOAD: boolean;
};

export type V2ACanaryPackage = {
  operationNamespace: string;
  productId: string;
  videoSha256: string;
  uploadPackageDigest: string;
  targetChannelId: string;
  sourceGitSha: string;
  visibility: "private";
};

export type V2AUploadedResource = {
  youtubeVideoId: string;
  channelId: string;
  privacyStatus: "private";
  title: string;
  descriptionSha256: string;
};

export type V2AUploadAdapterResult =
  | { state: "uploaded_private"; resource: V2AUploadedResource; adapterVersion: string }
  | { state: "ambiguous"; reasonCode: "UPLOAD_OUTCOME_AMBIGUOUS" }
  | { state: "failed"; reasonCode: string };

export type V2AReadbackResult =
  | { state: "verified_private" }
  | { state: "ambiguous"; reasonCode: string }
  | { state: "failed"; reasonCode: string };

export type V2ACanaryDependencies = {
  idempotencyStore: {
    lookup(key: string): Promise<V2AIdempotencyStatus>;
    reserve(key: string): Promise<boolean>;
    writeSuccess(receipt: V2APrivateUploadReceipt): Promise<string>;
    markAmbiguous(marker: V2AAmbiguousMarker): Promise<string>;
  };
  uploadAdapter: {
    uploadPrivate(uploadPackage: V2ACanaryPackage): Promise<V2AUploadAdapterResult>;
  };
  readbackVerifier: {
    verify(resource: V2AUploadedResource, uploadPackage: V2ACanaryPackage): Promise<V2AReadbackResult>;
  };
  now?: () => string;
};

export type V2ACanaryResult = {
  state: V2AUploadState;
  executed: boolean;
  uploadCalls: number;
  platformUploads: 0 | 1;
  duplicatePrevented: boolean;
  reasonCode: string;
  receiptPath: string | null;
  receipt: V2APrivateUploadReceipt | null;
};

function held(reasonCode: string, duplicatePrevented = false): V2ACanaryResult {
  return {
    state: "held",
    executed: false,
    uploadCalls: 0,
    platformUploads: 0,
    duplicatePrevented,
    reasonCode,
    receiptPath: null,
    receipt: null
  };
}

function executionFlagsPass(flags: V2ACanaryRuntimeFlags): boolean {
  return flags.YOUTUBE_UPLOAD_ENABLED === true &&
    flags.SAFE_TO_UPLOAD === true &&
    flags.YOUTUBE_AUTO_UPLOAD === false &&
    flags.YOUTUBE_PUBLIC_UPLOAD_ENABLED === false &&
    flags.YOUTUBE_PUBLICATION_ENABLED === false;
}

export async function executeSingleV2APrivateCanary(input: {
  approvalPhrase: string | undefined;
  readiness: {
    ready: boolean;
    uploadPackageDigest: string | null;
    targetChannelId: string | null;
  };
  flags: V2ACanaryRuntimeFlags;
  uploadPackage: V2ACanaryPackage;
  dependencies: V2ACanaryDependencies;
}): Promise<V2ACanaryResult> {
  if (input.approvalPhrase !== APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD) {
    return held("OWNER_APPROVAL_REQUIRED");
  }
  if (!input.readiness.ready ||
      input.readiness.uploadPackageDigest !== input.uploadPackage.uploadPackageDigest ||
      input.readiness.targetChannelId !== input.uploadPackage.targetChannelId) {
    return held("YOUTUBE_PRIVATE_CANARY_NOT_READY");
  }
  if (!executionFlagsPass(input.flags)) {
    return held("CANARY_RUNTIME_FLAGS_NOT_EXPLICITLY_ENABLED");
  }
  if (input.uploadPackage.visibility !== "private") {
    return held("PRIVATE_ONLY_GUARD_REJECTED");
  }

  const key = buildV2AIdempotencyKey({
    channelId: input.uploadPackage.targetChannelId,
    videoSha256: input.uploadPackage.videoSha256,
    productId: input.uploadPackage.productId,
    operationNamespace: input.uploadPackage.operationNamespace
  });
  const existing = await input.dependencies.idempotencyStore.lookup(key);
  if (existing.status === "successful") {
    if (existing.receipt.uploadPackageSha256 !== input.uploadPackage.uploadPackageDigest) {
      return {
        ...held("SUCCESS_RECEIPT_PACKAGE_MISMATCH", true),
        state: "ambiguous"
      };
    }
    return {
      ...held("DUPLICATE_SUCCESS_RECEIPT_EXISTS", true),
      state: "verified_private",
      receipt: existing.receipt
    };
  }
  if (existing.status === "ambiguous") {
    return {
      ...held("AMBIGUOUS_UPLOAD_REQUIRES_RECONCILIATION", true),
      state: "ambiguous"
    };
  }
  if (existing.status === "reserved") {
    return held("UPLOAD_ALREADY_RESERVED", true);
  }
  if (!(await input.dependencies.idempotencyStore.reserve(key))) {
    return held("UPLOAD_ALREADY_RESERVED", true);
  }

  const startedAt = (input.dependencies.now ?? (() => new Date().toISOString()))();
  let uploadResult: V2AUploadAdapterResult;
  try {
    uploadResult = await input.dependencies.uploadAdapter.uploadPrivate(input.uploadPackage);
  } catch {
    await markOutcomeAmbiguous(input, key, startedAt);
    return {
      ...held("UPLOAD_ADAPTER_EXCEPTION", true),
      state: "ambiguous",
      executed: true,
      uploadCalls: 1,
      platformUploads: 1
    };
  }
  if (uploadResult.state === "failed") {
    const marker = buildV2AAmbiguousMarker({
      idempotencyKey: key,
      operationNamespace: input.uploadPackage.operationNamespace,
      productId: input.uploadPackage.productId,
      videoSha256: input.uploadPackage.videoSha256,
      targetChannelId: input.uploadPackage.targetChannelId,
      createdAt: startedAt
    });
    await input.dependencies.idempotencyStore.markAmbiguous(marker);
    return {
      ...held(uploadResult.reasonCode),
      state: "failed",
      executed: true,
      uploadCalls: 1
    };
  }
  if (uploadResult.state === "ambiguous") {
    const marker = buildV2AAmbiguousMarker({
      idempotencyKey: key,
      operationNamespace: input.uploadPackage.operationNamespace,
      productId: input.uploadPackage.productId,
      videoSha256: input.uploadPackage.videoSha256,
      targetChannelId: input.uploadPackage.targetChannelId,
      createdAt: startedAt
    });
    await input.dependencies.idempotencyStore.markAmbiguous(marker);
    return {
      ...held(uploadResult.reasonCode, true),
      state: "ambiguous",
      executed: true,
      uploadCalls: 1,
      platformUploads: 1
    };
  }

  let readback: V2AReadbackResult;
  try {
    readback = await input.dependencies.readbackVerifier.verify(uploadResult.resource, input.uploadPackage);
  } catch {
    await markOutcomeAmbiguous(input, key, startedAt);
    return {
      ...held("READBACK_VERIFIER_EXCEPTION", true),
      state: "ambiguous",
      executed: true,
      uploadCalls: 1,
      platformUploads: 1
    };
  }
  if (readback.state !== "verified_private") {
    const marker = buildV2AAmbiguousMarker({
        idempotencyKey: key,
        operationNamespace: input.uploadPackage.operationNamespace,
        productId: input.uploadPackage.productId,
        videoSha256: input.uploadPackage.videoSha256,
        targetChannelId: input.uploadPackage.targetChannelId,
        createdAt: startedAt
    });
    await input.dependencies.idempotencyStore.markAmbiguous(marker);
    return {
      ...held(readback.reasonCode, true),
      state: readback.state,
      executed: true,
      uploadCalls: 1,
      platformUploads: 1
    };
  }

  const receipt = buildV2APrivateUploadReceipt({
    operationNamespace: input.uploadPackage.operationNamespace,
    productId: input.uploadPackage.productId,
    videoSha256: input.uploadPackage.videoSha256,
    uploadPackageSha256: input.uploadPackage.uploadPackageDigest,
    targetChannelId: input.uploadPackage.targetChannelId,
    youtubeVideoId: uploadResult.resource.youtubeVideoId,
    privacyStatus: "private",
    createdAt: startedAt,
    completedAt: (input.dependencies.now ?? (() => new Date().toISOString()))(),
    apiOutcome: "verified_private",
    sourceGitSha: input.uploadPackage.sourceGitSha,
    adapterVersion: uploadResult.adapterVersion
  });
  const receiptPath = await input.dependencies.idempotencyStore.writeSuccess(receipt);
  return {
    state: "verified_private",
    executed: true,
    uploadCalls: 1,
    platformUploads: 1,
    duplicatePrevented: false,
    reasonCode: "PRIVATE_UPLOAD_VERIFIED",
    receiptPath,
    receipt
  };
}

async function markOutcomeAmbiguous(
  input: Parameters<typeof executeSingleV2APrivateCanary>[0],
  key: string,
  createdAt: string
): Promise<void> {
  await input.dependencies.idempotencyStore.markAmbiguous(buildV2AAmbiguousMarker({
    idempotencyKey: key,
    operationNamespace: input.uploadPackage.operationNamespace,
    productId: input.uploadPackage.productId,
    videoSha256: input.uploadPackage.videoSha256,
    targetChannelId: input.uploadPackage.targetChannelId,
    createdAt
  }));
}
