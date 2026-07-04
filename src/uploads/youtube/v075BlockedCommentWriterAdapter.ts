import type { V075CommentWriterBlocker } from "./v075CommentSafetyGate";
import type {
  V075CommentWriterAdapter,
  V075CommentWriterAdapterResult
} from "./v075CommentWriterAdapter";

export class BlockedV075CommentWriterAdapter implements V075CommentWriterAdapter {
  readonly mode = "blocked" as const;

  async createTopLevelComment(): Promise<V075CommentWriterAdapterResult> {
    return blockedResult("BLOCKED_V075_REAL_COMMENT_MUTATION_FORBIDDEN");
  }
}

export function blockedResult(blocker: V075CommentWriterBlocker): V075CommentWriterAdapterResult {
  return {
    status: "BLOCKED",
    blocker,
    commentId: null,
    commentCreateCalled: false,
    commentThreadsInsertCalled: false,
    fakeSuccess: false,
    rawUrlsPrinted: false,
    rawVideoIdsPrinted: false,
    rawChannelIdsPrinted: false,
    secretsPrinted: false
  };
}
