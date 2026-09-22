import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { CommercePocLocalPreview } from "@/components/CommercePocLocalPreview";
import { buildScheduledEventProductPreview } from "@/lib/coupang/scheduledEventProductProvider";
import { COMMERCE_DAILY_KST_SLOTS } from "@/lib/orchestration/commerceDailyCadence";
import {
  buildCommerceAutoPreviewPlan,
  COMMERCE_PREVIEW_MAX_FILE_BYTES,
  parseCommerceProductPreview
} from "@/lib/orchestration/commercePocPreview";
import type { CollectedProduct } from "@/lib/orchestration/commercePocSchemas";

export const dynamic = "force-dynamic";

type LocalDraftReviewJson = {
  voiceover?: { generated?: boolean };
  render?: { audio_muxed?: boolean };
  pass?: boolean;
};

export default async function CommercePocPreviewPage() {
  const products = await readLocalProductPool();
  const scheduledProductPools = await readScheduledProductPools();
  const plan = buildCommerceAutoPreviewPlan({ products });
  const dailySlots = await Promise.all(COMMERCE_DAILY_KST_SLOTS.map(async (slot) => {
    const draftState = await readScheduledDraftReviewState(slot.id);
    return {
      ...buildScheduledEventProductPreview({
      slotId: slot.id,
      products: scheduledProductPools.get(slot.id) ?? []
      }),
      draft_video_preview_url: draftState.videoUrl,
      voiceover_ready: draftState.voiceoverReady,
      asr_pass: draftState.asrPass
    };
  }));

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
        사용자가 상품 JSONL을 고르는 화면이 아닙니다. 승인된 로컬 스케줄러가 시간대별로 저장한 실제 상품 검색 결과를 자동 검토합니다.
        이 화면 자체는 외부 검색·DB/R2·queue·worker job·플랫폼 게시를 실행하지 않으며, 상품 선정 결과는 owner review 전까지 게시 권한이 없습니다.
      </section>

      <CommercePocLocalPreview plan={plan} dailySlots={dailySlots} />
    </div>
  );
}

async function readScheduledDraftReviewState(slotId: (typeof COMMERCE_DAILY_KST_SLOTS)[number]["id"]) {
  const root = path.join(process.cwd(), "data", "commerce-poc", "video-drafts", slotId);
  const videoPath = path.join(root, "preview.mp4");
  let videoUrl: string | null = null;
  try {
    const fileStat = await stat(videoPath);
    videoUrl = fileStat.isFile() && fileStat.size > 0 && fileStat.size <= 100 * 1024 * 1024
      ? `/api/commerce-poc/video-drafts/${slotId}` : null;
  } catch {}
  const manifest = await readBoundedLocalJson(path.join(root, "manifest.json"), 256 * 1024);
  const asrProbe = await readBoundedLocalJson(path.join(root, "asr-probe.json"), 64 * 1024);
  return {
    videoUrl,
    voiceoverReady: manifest?.voiceover?.generated === true && manifest?.render?.audio_muxed === true,
    asrPass: asrProbe?.pass === true
  };
}

async function readBoundedLocalJson(filePath: string, maxBytes: number): Promise<LocalDraftReviewJson | null> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > maxBytes) return null;
    return JSON.parse(await readFile(filePath, "utf8")) as LocalDraftReviewJson;
  } catch {
    return null;
  }
}

async function readScheduledProductPools() {
  const directory = path.join(process.cwd(), "data", "commerce-poc");
  const pools = new Map<(typeof COMMERCE_DAILY_KST_SLOTS)[number]["id"], CollectedProduct[]>();
  for (const slot of COMMERCE_DAILY_KST_SLOTS) {
    const filePath = path.join(directory, `provider-products-${slot.id}.jsonl`);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile() || fileStat.size > COMMERCE_PREVIEW_MAX_FILE_BYTES) {
        continue;
      }
      pools.set(slot.id, parseCommerceProductPreview(await readFile(filePath, "utf8")).products);
    } catch {
      // A missing slot file is rendered as an explicit local-data blocker.
    }
  }
  return pools;
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
