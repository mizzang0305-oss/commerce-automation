/** Review-only rerender. Failed name gates remain blocked; this script never creates READY or uploads. */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildPopGroupCaptions, restoreKnownCaptionTokens, splitOverlongPunctuationToken } from "../../src/lib/video-automation/captionIntegration";
import { evaluateFreshAudioIdentity } from "../../src/lib/video-automation/freshAudioIdentity";
import { runJsonProcess } from "../../src/lib/video-automation/localRuntime";
import { createLocalWhisperXProcess, PersistentWhisperXProvider } from "../../src/lib/video-automation/whisperxPersistentProvider";

type Item = { historicalVideoId: string; historicalProductRoot: string; liveInputManifest: string; requiredExactTerms: string[]; pronunciationAliases?: Record<string, string> };
type Config = { outputRoot: string; items: Item[] };
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

async function audioPcmHash(videoPath: string): Promise<string> {
  return new Promise((done, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-i", videoPath, "-map", "0:a:0", "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] });
    const digest = createHash("sha256");
    child.stdout.on("data", (chunk: Buffer) => digest.update(chunk));
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? done(digest.digest("hex")) : reject(new Error("FINAL_AUDIO_DECODE_FAILED")));
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 3) throw new Error("EXACT_CONFIG_PATH_REQUIRED");
  const config = JSON.parse(await readFile(resolve(process.argv[2]), "utf8")) as Config;
  if (config.items?.length !== 3) throw new Error("THREE_PRODUCT_CONFIG_REQUIRED");
  const python = process.env.VIDEO_AUTOMATION_PYTHON?.trim();
  if (!python) throw new Error("LOCAL_RENDER_RUNTIME_NOT_CONFIGURED");
  const bridge = resolve("tools", "video-automation", "local_media_bridge.py");
  const whisperService = resolve("tools", "video-automation", "whisperx_jsonl_service.py");
  const whisper = new PersistentWhisperXProvider(() => createLocalWhisperXProcess(python, whisperService, { ...process.env, HF_HOME: process.env.VIDEO_AUTOMATION_HF_HOME, TORCH_HOME: process.env.VIDEO_AUTOMATION_TORCH_HOME }), 300_000);
  const outputRoot = resolve(config.outputRoot);
  const results: Record<string, unknown>[] = [];
  await whisper.start();
  try {
    for (const item of config.items) {
      const itemRoot = join(outputRoot, item.historicalVideoId);
      const videoRoot = join(itemRoot, "review-only-video-attempt-3");
      await mkdir(videoRoot); // exclusive; never overwrite an earlier render
      const audioEvidence = JSON.parse(await readFile(join(itemRoot, "audio-identity-result.json"), "utf8")) as {
        productId: string; canonicalProductName: string; asrTranscript: string; audioSha256: string; historicalAudioSha256: string;
        sourceImageSha256: string; historicalNarrationSha256: string;
      };
      const live = JSON.parse(await readFile(resolve(item.liveInputManifest), "utf8")) as { products?: Array<{ product: {
        productKey: string; canonicalProductName: string; exactProductReference?: { localPath: string };
      } }> };
      const product = live.products?.[0]?.product;
      const historicalRoot = resolve(item.historicalProductRoot);
      const summary = JSON.parse(await readFile(join(historicalRoot, "summary.json"), "utf8")) as { productKey: string; canonicalProductName: string };
      const plan = JSON.parse(await readFile(join(historicalRoot, "render-plan.json"), "utf8")) as { selectedHook: string };
      const imagePath = product?.exactProductReference?.localPath;
      if (!product || live.products?.length !== 1 || !imagePath || product.productKey !== summary.productKey || product.canonicalProductName !== summary.canonicalProductName || audioEvidence.productId !== product.productKey) throw new Error("CANONICAL_PRODUCT_BINDING_MISMATCH");
      if (hash(await readFile(imagePath)) !== audioEvidence.sourceImageSha256) throw new Error("SOURCE_IMAGE_CHANGED");
      const audioPath = join(itemRoot, "tts.wav");
      if (hash(await readFile(audioPath)) !== audioEvidence.audioSha256) throw new Error("NEW_AUDIO_CHANGED_SINCE_ASR");
      const alignment = await whisper.align(audioPath, audioEvidence.asrTranscript);
      if (alignment.status !== "success" || alignment.transcript_source !== "provided_local_asr" || !alignment.words?.length || (alignment.aligned_ratio ?? 0) < 0.95) throw new Error("NEW_AUDIO_ALIGNMENT_FAILED");
      await writeFile(join(videoRoot, "alignment-raw.json"), `${JSON.stringify({ alignedRatio: alignment.aligned_ratio, words: alignment.words }, null, 2)}\n`, "utf8");
      const alignedWords = splitOverlongPunctuationToken(alignment.words).map((word) => ({ ...word, word: word.word.replace(/이지바이/gu, "EasyBuy") }));
      const words = restoreKnownCaptionTokens(alignedWords, product.canonicalProductName.split(/\s+/u));
      const captions = buildPopGroupCaptions(words);
      const narration = (await readFile(join(itemRoot, "narration.txt"), "utf8")).trim();
      const oldCandidate = JSON.parse(await readFile(join(historicalRoot, "render-plan.json"), "utf8")) as { candidateId: string };
      // The prior narration digest was captured in the audio probe; it is compared again below.
      const gate = evaluateFreshAudioIdentity({
        canonicalProductName: product.canonicalProductName, asrTranscript: audioEvidence.asrTranscript,
        captionText: captions.map((cue) => cue.text).join(" "), narration,
        historicalNarrationSha256: audioEvidence.historicalNarrationSha256, audioSha256: audioEvidence.audioSha256,
        historicalAudioSha256: audioEvidence.historicalAudioSha256,
        requiredExactTerms: item.requiredExactTerms, pronunciationAliases: item.pronunciationAliases
      });
      if (hash(narration) === audioEvidence.historicalNarrationSha256 || audioEvidence.audioSha256 === audioEvidence.historicalAudioSha256) throw new Error("HISTORICAL_NARRATION_OR_AUDIO_REUSED");
      await writeFile(join(videoRoot, "captions.json"), `${JSON.stringify({ schema: "fresh-caption-timeline/v1", source: "new_tts_then_new_asr_then_alignment", audioSha256: audioEvidence.audioSha256, canonicalProductName: product.canonicalProductName, cues: captions, canonicalNameMatch: gate.captionNameMatch }, null, 2)}\n`, "utf8");
      await writeFile(join(videoRoot, "alignment.json"), `${JSON.stringify({ alignedRatio: alignment.aligned_ratio, transcriptSource: alignment.transcript_source, words: alignment.words }, null, 2)}\n`, "utf8");
      const label = "상품 이미지 · 실사용 아님";
      const layout = await runJsonProcess(python, [bridge], { operation: "layout_plan", hook: plan.selectedHook, usage_label: label }, 60_000);
      if (layout.passed !== true) throw new Error("LAYOUT_FAILED");
      const videoPath = join(videoRoot, "output.mp4");
      const render = await runJsonProcess(python, [bridge], {
        operation: "render_v2", output: videoPath, audio_path: audioPath, image_paths: [imagePath], scene_roles: ["product_reference"],
        visual_mode: "product_information", source_sha256: [audioEvidence.sourceImageSha256], allowed_root: dirname(resolve(item.liveInputManifest)),
        captions, hook: plan.selectedHook, title: product.canonicalProductName, usage_label: label,
        layout_plan: layout, caption_font_px: 66, caption_animation: "pop", primary_visual_width_ratio: 0.92, canvas_fill_ratio: 0.93
      }, 900_000);
      if (render.status !== "success" || Number(render.product_reference_scene_count) !== captions.length || Number(render.generic_usage_scene_source_count) !== 0 || render.publication_ready !== false) throw new Error("REVIEW_ONLY_RENDER_CONTRACT_FAILED");
      const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-show_entries", "format=duration", "-of", "json", videoPath], { encoding: "utf8" });
      if (probe.status !== 0) throw new Error("NEW_VIDEO_FFPROBE_FAILED");
      const media = JSON.parse(probe.stdout) as { streams?: Array<{ codec_name: string; width?: number; height?: number }>; format?: { duration?: string } };
      if (!media.streams?.some((stream) => stream.codec_name === "h264" && stream.width === 1080 && stream.height === 1920) || !media.streams?.some((stream) => stream.codec_name === "aac")) throw new Error("NEW_VIDEO_MEDIA_CONTRACT_FAILED");
      const decode = spawnSync("ffmpeg", ["-v", "error", "-i", videoPath, "-f", "null", "NUL"], { encoding: "utf8", timeout: 900_000 });
      if (decode.status !== 0) throw new Error("NEW_VIDEO_FULL_DECODE_FAILED");
      const finalAudioPcmSha256 = await audioPcmHash(videoPath);
      const historicalFinalAudioPcmSha256 = await audioPcmHash(join(historicalRoot, "final", "output.mp4"));
      const blockers = [...new Set([...gate.blockers, ...(finalAudioPcmSha256 === historicalFinalAudioPcmSha256 ? ["HISTORICAL_FINAL_AUDIO_HASH_REUSED"] : []), "IMAGE_RIGHTS_UNVERIFIED", "INDEPENDENT_FULL_CONTENT_REVIEW_MISSING"])];
      const result = {
        historicalVideoId: item.historicalVideoId, productId: product.productKey, canonicalProductName: product.canonicalProductName,
        selectedCandidateId: oldCandidate.candidateId, sourceImageSha256: audioEvidence.sourceImageSha256,
        narrationSha256: hash(narration), historicalNarrationSha256: audioEvidence.historicalNarrationSha256,
        audioSha256: audioEvidence.audioSha256, historicalAudioSha256: audioEvidence.historicalAudioSha256,
        videoSha256: hash(await readFile(videoPath)), finalAudioPcmSha256, historicalFinalAudioPcmSha256,
        finalAudioHashChanged: finalAudioPcmSha256 !== historicalFinalAudioPcmSha256,
        visualProductSceneCount: Number(render.product_reference_scene_count), genericSceneCount: Number(render.generic_usage_scene_source_count),
        asrCanonicalNameMatch: gate.asrNameMatch, captionCanonicalNameMatch: gate.captionNameMatch,
        scriptIdentity: "SOURCE_CREATIVE_BOUND_BUT_ASR_FAILED", independentReview: "PENDING", rightsReview: "unverified",
        machineMediaValidation: "PASS_H264_AAC_1080X1920_FULL_DECODE", blockers, publicationCandidate: false,
        videoPath, audioPath, captionsPath: join(videoRoot, "captions.json"), uploadAttempted: false
      };
      results.push(result);
      await writeFile(join(videoRoot, "independent-review-input.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
      console.log(JSON.stringify({ historicalVideoId: item.historicalVideoId, render: "PASS_REVIEW_ONLY", finalAudioHashChanged: result.finalAudioHashChanged, asrNameMatch: result.asrCanonicalNameMatch, captionNameMatch: result.captionCanonicalNameMatch, blockers }));
    }
  } finally { await whisper.close(); }
  await writeFile(join(outputRoot, "review-only-rerender-summary.json"), `${JSON.stringify({ results, signedReceipts: 0, publicationCandidateCount: 0, uploadAttempted: false }, null, 2)}\n`, "utf8");
}

void main().catch((error: unknown) => {
  const safeCode = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message) ? error.message : "FRESH_REVIEW_RENDER_FAILED";
  console.error(JSON.stringify({ safeCode, uploadAttempted: false }));
  process.exitCode = 1;
});
