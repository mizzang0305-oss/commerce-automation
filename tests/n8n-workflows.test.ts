import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflowDir = path.join(process.cwd(), "n8n", "workflows");

function readWorkflow(fileName: string) {
  const filePath = path.join(workflowDir, fileName);
  expect(existsSync(filePath), `${fileName} should exist`).toBe(true);
  const raw = readFileSync(filePath, "utf8");
  return { raw, workflow: JSON.parse(raw) as Record<string, unknown> };
}

function nodeByName(workflow: Record<string, unknown>, name: string) {
  const nodes = workflow.nodes as Array<Record<string, unknown>>;
  const node = nodes.find((candidate) => candidate.name === name);
  expect(node, `${name} node should exist`).toBeTruthy();
  return node!;
}

function headersFor(node: Record<string, unknown>) {
  const parameters = node.parameters as {
    headerParameters?: { parameters?: Array<{ name: string; value: string }> };
  };
  return parameters.headerParameters?.parameters ?? [];
}

function outgoingNodes(workflow: Record<string, unknown>, fromNode: string) {
  const connections = workflow.connections as Record<string, { main?: Array<Array<{ node: string }>> }>;
  return connections[fromNode]?.main?.flat().map((connection) => connection.node) ?? [];
}

describe("n8n workflow exports", () => {
  it("defines the nightly scout webhook contract and required variable references", () => {
    const { raw, workflow } = readWorkflow("A_Nightly_Scout_69.json");

    expect(workflow.name).toBe("A_Nightly_Scout_69");
    expect(nodeByName(workflow, "Webhook - nightly-scout").parameters).toMatchObject({
      path: "nightly-scout",
      httpMethod: "POST"
    });
    expect(raw).toContain("COUPANG_PARTNERS_PROVIDER_ENABLED");
    expect(raw).toContain("COUPANG_PARTNERS_ACCESS_KEY");
    expect(raw).toContain("COUPANG_PARTNERS_SECRET_KEY");
    expect(raw).toContain("COUPANG_ACCESS_KEY");
    expect(raw).toContain("COUPANG_SECRET_KEY");
    expect(raw).toContain("COUPANG_CUSTOMER_ID");
    expect(raw).toContain("COUPANG_PARTNER_ID");
    expect(raw).toContain("COUPANG_PARTNERS_CUSTOMER_ID");
    expect(raw).toContain("COMMERCE_AUTOMATION_API_SECRET");
    expect(raw).toContain("Authorization");
    expect(raw).toContain("배수구 거름망");
    expect(raw).toContain("고가전자제품");
    expect(raw).toContain("queue_status");
    expect(raw).toContain("scheduled");
  });

  it("aligns Coupang Partners workflow auth gates with the shared readiness contract", () => {
    const { raw } = readWorkflow("A_Nightly_Scout_69.json");

    expect(raw).toContain("COUPANG_PARTNERS_PROVIDER_ENABLED");
    expect(raw).toContain("providerEnabled");
    expect(raw).toContain("customerOrPartnerId");
    expect(raw).toContain("accessKey");
    expect(raw).toContain("secretKey");
    expect(raw).toContain("signedSearch");
    expect(raw).toContain("provider enabled");
    expect(raw).toContain("customer/partner id");
  });

  it("defines the next batch workflow without pretending to process missing items", () => {
    const { raw, workflow } = readWorkflow("B_Next_Batch_3.json");

    expect(workflow.name).toBe("B_Next_Batch_3");
    expect(nodeByName(workflow, "Webhook - next-batch").parameters).toMatchObject({
      path: "next-batch",
      httpMethod: "POST"
    });
    expect(raw).toContain("GEMINI_API_KEY");
    expect(raw).toContain("CREATOMATE_API_KEY");
    expect(raw).toContain("CREATOMATE_TEMPLATE_ID");
    expect(raw).toContain("처리할 items가 없어 batch를 실행하지 않았습니다.");
    expect(raw).toContain("ready_for_manual_upload");
    expect(raw).toContain("파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있습니다.");
  });

  it("defines the retry-item workflow and item callback contract", () => {
    const { raw, workflow } = readWorkflow("C_Retry_Item.json");

    expect(workflow.name).toBe("C_Retry_Item");
    expect(nodeByName(workflow, "Webhook - retry-item").parameters).toMatchObject({
      path: "retry-item",
      httpMethod: "POST"
    });
    expect(raw).toContain("/api/callback/n8n/item-result");
    expect(raw).toContain("retry_item");
    expect(raw).toContain("manual_review_status");
  });

  it("keeps upload and secret safety boundaries in all workflow exports", () => {
    const workflowNames = ["A_Nightly_Scout_69.json", "B_Next_Batch_3.json", "C_Retry_Item.json"];

    for (const workflowName of workflowNames) {
      const { raw } = readWorkflow(workflowName);
      expect(raw).not.toMatch(/videos\.insert|youtube_video_id|public_uploaded|fake success|fake uploaded/i);
      expect(raw).not.toContain("NEXT_PUBLIC_");
      expect(raw).not.toContain("localhost:3001");
      expect(raw).not.toMatch(/(sk-[A-Za-z0-9]|ya29\.|ghp_|xox[baprs]-|callback-secret|coupang-secret)/i);
      expect(raw).toContain("Bearer {{$vars.COMMERCE_AUTOMATION_API_SECRET}}");
    }
  });

  it("uses COMMERCE_AUTOMATION_BASE_URL for callback URLs instead of hardcoded URLs", () => {
    const expectations = [
      ["A_Nightly_Scout_69.json", "/api/callback/n8n/nightly-scout"],
      ["B_Next_Batch_3.json", "/api/callback/n8n/batch-result"],
      ["C_Retry_Item.json", "/api/callback/n8n/item-result"]
    ];

    for (const [workflowName, callbackPath] of expectations) {
      const { raw } = readWorkflow(workflowName);
      expect(raw).toContain("COMMERCE_AUTOMATION_BASE_URL");
      expect(raw).toContain(callbackPath);
      expect(raw).not.toContain("body.callback?.url");
    }
  });

  it("configures callback HTTP nodes with bearer auth and json content type", () => {
    const workflows = [
      ["A_Nightly_Scout_69.json", "Callback - nightly scout result"],
      ["B_Next_Batch_3.json", "Callback - batch result"],
      ["C_Retry_Item.json", "Callback - retry item result"]
    ];

    for (const [workflowName, callbackNodeName] of workflows) {
      const { workflow } = readWorkflow(workflowName);
      const callbackNode = nodeByName(workflow, callbackNodeName);
      const headers = headersFor(callbackNode);
      expect(headers).toContainEqual({
        name: "Authorization",
        value: "Bearer {{$vars.COMMERCE_AUTOMATION_API_SECRET}}"
      });
      expect(headers).toContainEqual({ name: "Content-Type", value: "application/json" });
    }
  });

  it("responds to webhook requests immediately before long-running processing branches", () => {
    const workflows = [
      ["A_Nightly_Scout_69.json", "Webhook - nightly-scout", "Respond - nightly scout accepted"],
      ["B_Next_Batch_3.json", "Webhook - next-batch", "Respond - batch accepted"],
      ["C_Retry_Item.json", "Webhook - retry-item", "Respond - retry accepted"]
    ];

    for (const [workflowName, webhookNodeName, responseNodeName] of workflows) {
      const { workflow } = readWorkflow(workflowName);
      expect(outgoingNodes(workflow, webhookNodeName)).toContain(responseNodeName);
      expect(nodeByName(workflow, responseNodeName).parameters).toMatchObject({
        options: { responseCode: 202 }
      });
    }
  });

  it("guards next-batch ready state when items or required upload-ready fields are missing", () => {
    const { raw } = readWorkflow("B_Next_Batch_3.json");

    expect(raw).toContain("items.length === 0");
    expect(raw).toContain("selected_affiliate_url");
    expect(raw).toContain("disclosure_text");
    expect(raw).toContain("videoUrl");
    expect(raw).toContain("blogDraftUrl");
    expect(raw).toContain("ready_for_manual_upload");
  });
});
