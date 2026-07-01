export type V050CommentAdapterStatus = {
  comment_adapter_injected: boolean;
  proven_v035_comment_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/public-upload-result.json";
  adapter_mode: "injected_check_only";
  comment_create_update_delete_allowed_in_v050: false;
  external_api_called: false;
  blocker: string | null;
};

export function buildV050CommentAdapterInjectionStatus(input: {
  commentAdapterInjected?: boolean;
} = {}): V050CommentAdapterStatus {
  const commentAdapterInjected = input.commentAdapterInjected !== false;
  return {
    comment_adapter_injected: commentAdapterInjected,
    proven_v035_comment_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/public-upload-result.json",
    adapter_mode: "injected_check_only",
    comment_create_update_delete_allowed_in_v050: false,
    external_api_called: false,
    blocker: commentAdapterInjected ? null : "COMMENT_ADAPTER_MISSING"
  };
}

export function createV050NoopCommentAdapter() {
  return async function createTopLevelComment() {
    throw new Error("V050 check-only comment adapter must never be called.");
  };
}
