import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V049_UPLOAD_APPROVAL_PHRASE
} from "../src/uploads/multi-channel/threeChannelUploadPreflight";
import {
  V049_PAID_PROMOTION_CONFIRMATION_PHRASE
} from "../src/uploads/multi-channel/paidPromotionSettingsGate";
import {
  V051_PAID_PROMOTION_CONFIRMATION_PHRASE,
  V051_UPLOAD_APPROVAL_PHRASE,
  buildV051ApprovalAliasStatus,
  buildV051UploadPreflight,
  executeV051ThreeChannelPublicUploads
} from "../src/uploads/multi-channel/v051ApprovalAliasWrapper";

const APPROVAL_TEXT = `${V051_UPLOAD_APPROVAL_PHRASE}\n${V051_PAID_PROMOTION_CONFIRMATION_PHRASE}`;
const STALE_V049_APPROVAL_TEXT = `${V049_UPLOAD_APPROVAL_PHRASE}\n${V049_PAID_PROMOTION_CONFIRMATION_PHRASE}`;
const AFFILIATE_URLS = {
  father_jobs: "REDACTED_AFFILIATE_URL_FATHER_JOBS",
  neoman_moleulgeol: "REDACTED_AFFILIATE_URL_NEOMAN_MOLEULGEOL",
  lets_buy: "REDACTED_AFFILIATE_URL_LETS_BUY"
} as const;
const SECRET_NEEDLES = /access_token|refresh_token|client_secret|Authorization|Bearer|link\.coupang\.com/i;

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v052-"));
}

async function writeV048Videos(cwd: string) {
  for (const channelKey of Object.keys(AFFILIATE_URLS)) {
    const videoPath = path.join(cwd, "commerce-assets", "review", "v048", channelKey, "local-review-video.mp4");
    await mkdir(path.dirname(videoPath), { recursive: true });
    await writeFile(videoPath, `fake-${channelKey}-video`, "utf8");
  }
}

describe("v052 v051 approval alias wrapper", () => {
  test("v051_approval_alias_tests accept v051 phrases and reject stale v049 approval phrases", () => {
    const ready = buildV051ApprovalAliasStatus({ approvalText: APPROVAL_TEXT });

    expect(ready).toMatchObject({
      FINAL_STATUS: "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD",
      V051_ALIAS_READY: true,
      SAFE_TO_UPLOAD: false,
      paid_promotion_confirmation_present: true,
      v051_upload_approval_present: true,
      v049_approval_phrase_present: false,
      v049_paid_promotion_phrase_present: false,
      v049_approval_phrases_rejected: true,
      approval_blocker: null
    });
    expect(JSON.stringify(ready)).not.toMatch(SECRET_NEEDLES);

    const stale = buildV051ApprovalAliasStatus({ approvalText: STALE_V049_APPROVAL_TEXT });

    expect(stale.V051_ALIAS_READY).toBe(false);
    expect(stale.FINAL_STATUS).toBe("BLOCKED_V051_STALE_V049_APPROVAL_REJECTED");
    expect(stale.approval_blocker).toBe("V049_APPROVAL_PHRASE_NOT_ALLOWED_IN_V051");
    expect(stale.v049_approval_phrase_present).toBe(true);
    expect(stale.v049_paid_promotion_phrase_present).toBe(true);
    expect(stale.v049_approval_phrases_rejected).toBe(true);
  });

  test("upload_v051_preflight reuses v049 preflight and v050 adapter readiness without upload side effects", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);

      const report = await buildV051UploadPreflight({
        cwd,
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS
      });

      expect(report).toMatchObject({
        FINAL_STATUS: "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD",
        V051_ALIAS_READY: true,
        V050_ADAPTERS_READY: true,
        CHANNEL_ROUTING_READY: true,
        SAFE_TO_UPLOAD: false,
        upload_adapter_injected: true,
        comment_adapter_injected: true,
        token_provider_injected: true,
        channel_account_router_injected: true,
        duplicate_upload_guard_injected: true,
        metadata_gate_injected: true,
        father_jobs_preflight_pass: true,
        neoman_moleulgeol_preflight_pass: true,
        lets_buy_preflight_pass: true,
        all_channel_preflight_pass: true,
        youtube_execute_called: false,
        videos_insert_called: false,
        comment_create_update_delete_called: false,
        visibility_changed: false,
        R2_upload: false,
        product_assets_write: false,
        DB_write: false,
        raw_urls_printed: false,
        secrets_printed: false,
        fake_success: false
      });

      const serialized = JSON.stringify(report);
      expect(serialized).not.toMatch(SECRET_NEEDLES);
      for (const rawUrl of Object.values(AFFILIATE_URLS)) {
        expect(serialized).not.toContain(rawUrl);
      }

      const reportPath = path.join(cwd, "commerce-assets", "review", "v052", "v051-approval-alias-preflight.json");
      const htmlPath = path.join(cwd, "commerce-assets", "review", "v052", "v051-approval-alias-preflight.html");
      await expect(stat(reportPath)).resolves.toBeTruthy();
      await expect(stat(htmlPath)).resolves.toBeTruthy();
      expect(await readFile(reportPath, "utf8")).not.toMatch(SECRET_NEEDLES);
      expect(await readFile(htmlPath, "utf8")).not.toMatch(SECRET_NEEDLES);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("upload_v051_execute uses injected noop adapters in check_only mode and never calls mutation APIs", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);

      const result = await executeV051ThreeChannelPublicUploads({
        cwd,
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS
      });

      expect(result).toMatchObject({
        FINAL_STATUS: "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD",
        V051_ALIAS_READY: true,
        V050_ADAPTERS_READY: true,
        CHANNEL_ROUTING_READY: true,
        SAFE_TO_UPLOAD: false,
        upload_execution_attempted: false,
        new_upload_attempted: false,
        youtube_execute_called: false,
        videos_insert_called: false,
        videos_insert_total_count: 0,
        comment_create_update_delete_called: false,
        visibility_changed: false,
        retry_loop_after_external_call: false,
        father_jobs_uploaded: false,
        neoman_moleulgeol_uploaded: false,
        lets_buy_uploaded: false,
        R2_upload: false,
        product_assets_write: false,
        DB_write: false,
        raw_urls_printed: false,
        secrets_printed: false,
        fake_success: false
      });
      expect(result.execution_result.blocker).toBe("CHECK_ONLY_NO_UPLOAD");
      expect(JSON.stringify(result)).not.toMatch(SECRET_NEEDLES);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("upload_v051_execute blocks stale v049 approval phrases before preflight or adapter execution", async () => {
    const result = await executeV051ThreeChannelPublicUploads({
      approvalText: STALE_V049_APPROVAL_TEXT,
      affiliateUrls: AFFILIATE_URLS
    });

    expect(result.FINAL_STATUS).toBe("BLOCKED_V051_STALE_V049_APPROVAL_REJECTED");
    expect(result.V051_ALIAS_READY).toBe(false);
    expect(result.approval_blocker).toBe("V049_APPROVAL_PHRASE_NOT_ALLOWED_IN_V051");
    expect(result.preflight_generated).toBe(false);
    expect(result.adapter_check_generated).toBe(false);
    expect(result.upload_execution_attempted).toBe(false);
    expect(result.videos_insert_called).toBe(false);
    expect(result.comment_create_update_delete_called).toBe(false);
  });
});
