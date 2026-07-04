import { blockedResult, BlockedV075CommentWriterAdapter } from "./v075BlockedCommentWriterAdapter";
import type { V075CommentWriterBlocker } from "./v075CommentSafetyGate";
import { MockV075CommentWriterAdapter } from "./v075MockCommentWriterAdapter";
import type { V075YouTubeCommentRequest } from "./v075CommentRequestBuilder";

export type V075CommentWriterAdapterMode = "blocked" | "mock" | "real_disabled";

export type V075CommentWriterAdapterResult = {
  status: "BLOCKED" | "MOCK_ONLY" | "DRY_RUN_ONLY";
  blocker: V075CommentWriterBlocker | null;
  commentId: null;
  commentCreateCalled: false;
  commentThreadsInsertCalled: false;
  fakeSuccess: false;
  rawUrlsPrinted: false;
  rawVideoIdsPrinted: false;
  rawChannelIdsPrinted: false;
  secretsPrinted: false;
};

export type V075CommentWriterAdapter = {
  mode: V075CommentWriterAdapterMode;
  createTopLevelComment(request: V075YouTubeCommentRequest): Promise<V075CommentWriterAdapterResult>;
};

export class DisabledRealV075CommentWriterAdapter implements V075CommentWriterAdapter {
  readonly mode = "real_disabled" as const;

  async createTopLevelComment(): Promise<V075CommentWriterAdapterResult> {
    return blockedResult("BLOCKED_V075_REAL_ADAPTER_DISABLED");
  }
}

export function createDefaultV075CommentWriterAdapter(): V075CommentWriterAdapter {
  return new BlockedV075CommentWriterAdapter();
}

export {
  BlockedV075CommentWriterAdapter,
  MockV075CommentWriterAdapter
};
