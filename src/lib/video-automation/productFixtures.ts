import { join } from "node:path";
import type { ProductVideoAutomationInput } from "./types";

type FixtureDefinition = Omit<ProductVideoAutomationInput["product"], "imagePaths"> & { imageDirectory: string; imageNames: string[] };

const FIXTURES: FixtureDefinition[] = [
  {
    productKey: "v039-father-jobs-car-cup-organizer",
    rawProductName: "차량용 컵홀더 정리함",
    canonicalProductName: "차량용 컵홀더 정리함",
    aliases: ["컵홀더 정리함", "차량용 정리함"],
    anchors: ["컵홀더", "수납", "소품", "차량"],
    category: "차량용품",
    imageDirectory: "commerce-assets/review/v039/father_jobs/generated-scenes",
    imageNames: ["01-car-messy-cup-holder.png", "02-driver-organizing-small-items.png", "03-clean-car-console.png", "04-product-hero-in-car-interior.png", "05-before-after-car-storage.png", "06-clean-car-dashboard-cta.png"]
  },
  {
    productKey: "v039-neoman-folding-drying-rack",
    rawProductName: "접이식 빨래건조대",
    canonicalProductName: "접이식 빨래건조대",
    aliases: ["접이식 건조대", "빨래 건조대"],
    anchors: ["빨래", "건조", "공간", "접이식"],
    category: "생활/건조",
    imageDirectory: "commerce-assets/review/v039/neoman_moleulgeol/generated-scenes",
    imageNames: ["01-rainy-window-laundry-problem.png", "02-wet-laundry-slow-dry.png", "03-small-room-laundry-mess.png", "04-drying-rack-solution-reveal.png", "05-laundry-use-case.png", "06-organized-indoor-drying-result.png"]
  },
  {
    productKey: "v039-lets-buy-cable-organizer",
    rawProductName: "특가 케이블 정리함",
    canonicalProductName: "특가 케이블 정리함",
    aliases: ["케이블 정리함", "선 정리함"],
    anchors: ["케이블", "정리", "책상", "고정"],
    category: "전자액세서리",
    imageDirectory: "commerce-assets/review/v039/lets_buy/generated-scenes",
    imageNames: ["01-messy-desk-cables.png", "02-cable-clutter-closeup.png", "03-cable-organizer-reveal.png", "04-organized-desk-after.png", "05-before-after-cable-setup.png", "06-clean-desk-setup-cta.png"]
  }
];

export function loadApprovedProductFixtures(assetRoot: string, runId: string): ProductVideoAutomationInput[] {
  if (!assetRoot.trim()) throw new Error("VIDEO_AUTOMATION_ASSET_ROOT_REQUIRED");
  return FIXTURES.map(({ imageDirectory, imageNames, ...product }) => ({
    runId,
    product: { ...product, imagePaths: imageNames.map((name) => join(assetRoot, imageDirectory, name)) },
    creative: { candidateCount: 3, language: "ko" },
    mode: "local_review_only"
  }));
}
