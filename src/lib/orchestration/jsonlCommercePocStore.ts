import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  collectedProductSchema,
  type CollectedProduct,
  type CommerceContentDraft,
  type ReviewedProduct
} from "@/lib/orchestration/commercePocSchemas";

export class JsonlCommercePocStore {
  constructor(private readonly dataDir = join(process.cwd(), "data", "commerce-poc")) {}

  appendCollected(batchId: string, records: CollectedProduct[]) {
    return this.append("staging-products.jsonl", batchId, records);
  }

  async readCollected(excludeBatchId?: string): Promise<CollectedProduct[]> {
    try {
      const content = await readFile(join(this.dataDir, "staging-products.jsonl"), "utf8");
      return content
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { batch_id: string; record: unknown })
        .filter((entry) => entry.batch_id !== excludeBatchId)
        .map((entry) => collectedProductSchema.parse(entry.record));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  appendReviews(batchId: string, records: ReviewedProduct[]) {
    return this.append("review-results.jsonl", batchId, records);
  }

  appendDrafts(batchId: string, records: CommerceContentDraft[]) {
    return this.append("content-drafts.jsonl", batchId, records);
  }

  private async append(fileName: string, batchId: string, records: unknown[]) {
    if (records.length === 0) {
      return;
    }
    await mkdir(this.dataDir, { recursive: true });
    const path = join(this.dataDir, fileName);
    const existingRecords = await this.readBatchRecords(path, batchId);
    if (existingRecords.length > 0) {
      if (JSON.stringify(existingRecords) === JSON.stringify(records)) {
        return;
      }
      throw new Error(`BATCH_ID_REUSED_WITH_DIFFERENT_RECORDS:${batchId}`);
    }
    const lines = records.map((record) => JSON.stringify({ batch_id: batchId, record })).join("\n");
    await appendFile(path, `${lines}\n`, "utf8");
  }

  private async readBatchRecords(path: string, batchId: string): Promise<unknown[]> {
    try {
      const content = await readFile(path, "utf8");
      return content
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { batch_id: string; record: unknown })
        .filter((entry) => entry.batch_id === batchId)
        .map((entry) => entry.record);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}
