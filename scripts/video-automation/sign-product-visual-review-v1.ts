import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signProductVisualReview, SigningGateError, type ProductVisualSigningManifest } from "../../src/lib/video-automation/productVisualReviewSigner";
import { verifyProductVisualReview } from "../../src/lib/video-automation/productVisualReview";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw new SigningGateError("SIGNER_ARGUMENT_MISSING");
  return process.argv[index + 1];
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function main(): Promise<void> {
  const repoRoot = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  const keyPath = await realpath(argument("--private-key-file"));
  const outputPath = path.resolve(argument("--output"));
  if (inside(repoRoot, keyPath) || inside(repoRoot, outputPath) || keyPath === outputPath) throw new SigningGateError("REVIEW_SECRET_OR_RECEIPT_PATH_UNSAFE");
  const manifest = JSON.parse(await readFile(argument("--manifest"), "utf8")) as ProductVisualSigningManifest;
  const ledger = JSON.parse(await readFile(argument("--current-ledger"), "utf8")) as { ledger?: Array<{ youtubeVideoId?: string; productId?: string }> };
  if (!Array.isArray(ledger.ledger)) throw new SigningGateError("PRIOR_PUBLICATION_LEDGER_INVALID");
  const publications = ledger.ledger.map((entry) => ({ youtubeVideoId: entry.youtubeVideoId ?? "", productId: entry.productId ?? "" }));
  const ids = publications.map((entry) => entry.youtubeVideoId);
  const privateKeyPem = await readFile(keyPath, "utf8");
  const receipt = await signProductVisualReview({ manifest, currentPriorPublications: publications, privateKeyPem });
  const publicKeyPem = await readFile(argument("--public-key-file"), "utf8");
  const verification = verifyProductVisualReview({
    receipt, productId: manifest.productId, canonicalProductName: manifest.canonicalProductName,
    affiliateProductId: manifest.affiliateProductId, affiliateUrl: manifest.affiliateUrl,
    videoSha256: receipt.videoSha256, publicKey: publicKeyPem, requiredPriorVideoIds: ids
  });
  if (!verification.ok) throw new SigningGateError(verification.safeError);
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  process.stdout.write("SIGNED_REVIEW_RECEIPT_CREATED\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof SigningGateError ? error.safeCode : "REVIEW_SIGNER_FAILED"}\n`);
  process.exitCode = 1;
});
