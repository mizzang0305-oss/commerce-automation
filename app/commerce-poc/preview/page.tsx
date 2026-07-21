import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { CommercePocLocalPreview } from "@/components/CommercePocLocalPreview";
import {
  buildCommerceAutoPreviewPlan,
  COMMERCE_PREVIEW_MAX_FILE_BYTES,
  parseCommerceProductPreview
} from "@/lib/orchestration/commercePocPreview";
import type { CollectedProduct } from "@/lib/orchestration/commercePocSchemas";

export const dynamic = "force-dynamic";

export default async function CommercePocPreviewPage() {
  const products = await readLocalProductPool();
  const plan = buildCommerceAutoPreviewPlan({ products });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Commerce PoC</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">한국 30일 일정·상품 자동 미리보기</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          실행일 기준 향후 30일의 한국 기념일, 행사 시즌, 방학 시작·종료를 자동 계산하고 수집된 실제 상품 자료 중 일정 적합도가 높은 후보를 자동 선택합니다.
        </p>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
        사용자가 상품 JSONL을 고르는 화면이 아닙니다. 이 화면은 내부 로컬 수집 자료를 자동 검토하며, 새 상품 외부 수집·DB/R2·queue·worker job·플랫폼 게시를 실행하지 않습니다.
        상품 선정 결과는 owner review 전까지 게시 권한이 없습니다.
      </section>

      <CommercePocLocalPreview plan={plan} />
    </div>
  );
}

async function readLocalProductPool(): Promise<CollectedProduct[]> {
  const directory = path.join(process.cwd(), "data", "commerce-poc");
  try {
    const fileNames = (await readdir(directory))
      .filter((fileName) => /(?:input|products).*\.(?:jsonl|ndjson)$/i.test(fileName))
      .sort()
      .slice(0, 20);
    const products: CollectedProduct[] = [];
    for (const fileName of fileNames) {
      const filePath = path.join(directory, fileName);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile() || fileStat.size > COMMERCE_PREVIEW_MAX_FILE_BYTES) {
        continue;
      }
      const result = parseCommerceProductPreview(await readFile(filePath, "utf8"));
      products.push(...result.products);
    }
    return products;
  } catch {
    return [];
  }
}
