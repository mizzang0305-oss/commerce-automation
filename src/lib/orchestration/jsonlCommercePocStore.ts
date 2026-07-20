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

  async readCollected(): Promise<CollectedProduct[]> {
    try {
      const content = await readFile(join(this.dataDir, "staging-products.jsonl"), "utf8");
      return content
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => collectedProductSchema.parse(JSON.parse(line).record));
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
    const lines = records.map((record) => JSON.stringify({ batch_id: batchId, record })).join("\n");
    await appendFile(join(this.dataDir, fileName), `${lines}\n`, "utf8");
  }
}
