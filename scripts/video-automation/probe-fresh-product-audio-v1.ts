/** Isolated, no-upload audio identity probe. It never opens producer/publisher state. */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { generateDeterministicCreativeCandidates } from "../../src/lib/video-automation/creativeCandidates";
import { evaluateFreshAudioIdentity } from "../../src/lib/video-automation/freshAudioIdentity";
import { runFasterWhisper, runJsonProcess } from "../../src/lib/video-automation/localRuntime";
import { buildKoreanProductNarrationPlan } from "../../src/lib/video-automation/ttsNormalization";
import type { ProductVideoAutomationInput } from "../../src/lib/video-automation/types";

type Item = {
  historicalVideoId: string;
  historicalProductRoot: string;
  liveInputManifest: string;
  requiredExactTerms: string[];
  pronunciationAliases?: Record<string, string>;
};
type Config = { outputRoot: string; items: Item[] };
const SHA = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

async function main(): Promise<void> {
  if (process.argv.length !== 3) throw new Error("EXACT_CONFIG_PATH_REQUIRED");
  const config = JSON.parse(await readFile(resolve(process.argv[2]), "utf8")) as Config;
  if (!Array.isArray(config.items) || config.items.length !== 3 || !config.outputRoot) throw new Error("THREE_PRODUCT_CONFIG_REQUIRED");
  const outputRoot = resolve(config.outputRoot);
  await mkdir(dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot); // exclusive: never overwrite a prior diagnostic
  const python = process.env.VIDEO_AUTOMATION_PYTHON?.trim();
  const ttsCommand = process.env.VIDEO_AUTOMATION_TTS_COMMAND?.trim();
  const asrScript = process.env.VIDEO_AUTOMATION_ASR_SCRIPT?.trim();
  const asrModel = process.env.VIDEO_AUTOMATION_ASR_MODEL?.trim();
  if (!python || !ttsCommand || !asrScript || !asrModel) throw new Error("LOCAL_VOICE_RUNTIME_NOT_CONFIGURED");
  const bridge = resolve("tools", "video-automation", "local_media_bridge.py");
  const results: Record<string, unknown>[] = [];
  for (const item of config.items) {
    const itemRoot = join(outputRoot, item.historicalVideoId);
    await mkdir(itemRoot);
    const live = JSON.parse(await readFile(resolve(item.liveInputManifest), "utf8")) as { products?: ProductVideoAutomationInput[] };
    if (live.products?.length !== 1) throw new Error("EXACT_ONE_LIVE_INPUT_REQUIRED");
    const input = live.products[0];
    const historicalRoot = resolve(item.historicalProductRoot);
    const summary = JSON.parse(await readFile(join(historicalRoot, "summary.json"), "utf8")) as { productKey: string; canonicalProductName: string };
    const plan = JSON.parse(await readFile(join(historicalRoot, "render-plan.json"), "utf8")) as { candidateId: string; selectedHook: string };
    if (summary.productKey !== input.product.productKey || summary.canonicalProductName !== input.product.canonicalProductName) throw new Error("CANONICAL_PRODUCT_BINDING_MISMATCH");
    const candidate = generateDeterministicCreativeCandidates(input).find((entry) => entry.id === plan.candidateId);
    if (!candidate || candidate.hook !== plan.selectedHook) throw new Error("HISTORICAL_CREATIVE_BINDING_MISMATCH");
    const narrationPlan = buildKoreanProductNarrationPlan({ canonicalProductName: summary.canonicalProductName, hook: candidate.hook, script: candidate.script });
    const historicalNarration = `상품명은 ${summary.canonicalProductName}입니다. ${candidate.hook} ${candidate.script}`.trim().replace(/\s+/gu, " ").replace(/컵홀더/gu, "컵 홀더").replace(/3가지/gu, "세 가지");
    const historicalAudio = await readFile(join(historicalRoot, "voice", "tts.wav"));
    const imagePath = input.product.exactProductReference?.localPath;
    if (!imagePath) throw new Error("EXACT_PRODUCT_IMAGE_REQUIRED");
    await stat(imagePath);
    const imageSha256 = SHA(await readFile(imagePath));
    const narrationPath = join(itemRoot, "narration.txt");
    await writeFile(narrationPath, `${narrationPlan.narration}\n`, "utf8");
    const audioPath = join(itemRoot, "tts.wav");
    const tts = await runJsonProcess(python, [bridge], { operation: "tts", text: narrationPlan.narration, target: audioPath, command: ttsCommand }, 660_000);
    if (tts.status !== "success") throw new Error("FRESH_TTS_FAILED");
    const freshAudioSha256 = SHA(await readFile(audioPath));
    const historicalAudioSha256 = SHA(historicalAudio);
    const asr = await runFasterWhisper({ pythonExe: python, scriptPath: asrScript, modelPath: asrModel, audioPath, outputPath: join(itemRoot, "asr-provider.json") });
    const gate = evaluateFreshAudioIdentity({
      canonicalProductName: summary.canonicalProductName, asrTranscript: asr.transcript,
      captionText: "", narration: narrationPlan.narration, historicalNarration,
      audioSha256: freshAudioSha256, historicalAudioSha256,
      requiredExactTerms: item.requiredExactTerms, pronunciationAliases: item.pronunciationAliases
    });
    const result = {
      historicalVideoId: item.historicalVideoId, productId: summary.productKey,
      canonicalProductName: summary.canonicalProductName, pronunciationProductName: narrationPlan.pronunciationProductName,
      sourceImageSha256: imageSha256, narrationSha256: SHA(narrationPlan.narration), historicalNarrationSha256: SHA(historicalNarration),
      audioSha256: freshAudioSha256, historicalAudioSha256,
      asrTranscript: asr.transcript, asrCanonicalNameMatch: gate.asrNameMatch,
      audioHashChanged: freshAudioSha256 !== historicalAudioSha256,
      narrationHashChanged: SHA(narrationPlan.narration) !== SHA(historicalNarration),
      captionIdentity: "NOT_TESTED", render: "NOT_ATTEMPTED", publicationCandidate: false,
      blockers: gate.blockers.filter((code) => code !== "CAPTION_CANONICAL_NAME_MISMATCH"),
      rightsReview: "unverified", uploadAttempted: false
    };
    results.push(result);
    await writeFile(join(itemRoot, "audio-identity-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ historicalVideoId: item.historicalVideoId, asrCanonicalNameMatch: result.asrCanonicalNameMatch, audioHashChanged: result.audioHashChanged, narrationHashChanged: result.narrationHashChanged, blockers: result.blockers }));
  }
  await writeFile(join(outputRoot, "audio-identity-summary.json"), `${JSON.stringify({ results, publicationCandidateCount: 0, rightsReview: "unverified", uploadAttempted: false }, null, 2)}\n`, "utf8");
}

void main().catch((error: unknown) => {
  const safeCode = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message) ? error.message : "FRESH_AUDIO_PROBE_FAILED";
  console.error(JSON.stringify({ safeCode, uploadAttempted: false }));
  process.exitCode = 1;
});
