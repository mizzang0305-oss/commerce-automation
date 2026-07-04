import type {
  V075CommentWriterAdapter,
  V075CommentWriterAdapterResult
} from "./v075CommentWriterAdapter";

export class MockV075CommentWriterAdapter implements V075CommentWriterAdapter {
  readonly mode = "mock" as const;

  async createTopLevelComment(): Promise<V075CommentWriterAdapterResult> {
    return {
      status: "MOCK_ONLY",
      blocker: null,
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
}
