import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import UploadsPage from "../app/uploads/page";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD,
  RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE,
  YOUTUBE_PRIVATE_SMOKE_CANDIDATE_ID,
  YOUTUBE_UPLOAD_SCOPE
} from "@/lib/uploads/youtube";

let tempTokenDir = "";

function clearYouTubeEnv() {
  for (const name of [
    "YOUTUBE_CLIENT_ID",
    "YOUTUBE_CLIENT_SECRET",
    "YOUTUBE_LOCAL_TOKEN_FILE_PATH",
    "YOUTUBE_TOKEN_FILE",
    "YOUTUBE_TOKEN_PROVIDER",
    "YOUTUBE_TOKEN_READY",
    "YOUTUBE_SCOPES_READY",
    "YOUTUBE_UPLOAD_ENABLED",
    "YOUTUBE_QUOTA_READY",
    "YOUTUBE_ACCOUNT_READY",
    "YOUTUBE_POLICY_READY",
    "PUBLIC_UPLOAD_ENABLED"
  ]) {
    vi.stubEnv(name, "");
  }
}

function setReadyYouTubeEnv() {
  tempTokenDir = path.join(tmpdir(), `commerce-youtube-token-test-${Date.now()}`);
  mkdirSync(tempTokenDir, { recursive: true });
  const tokenFile = path.join(tempTokenDir, "youtube-token.json");
  writeFileSync(
    tokenFile,
    JSON.stringify({ access_token: "test-access-token", refresh_token: "test-refresh-token", scope: YOUTUBE_UPLOAD_SCOPE }),
    "utf8"
  );

  vi.stubEnv("YOUTUBE_CLIENT_ID", "configured-client-id");
  vi.stubEnv("YOUTUBE_CLIENT_SECRET", "configured-client-secret");
  vi.stubEnv("YOUTUBE_TOKEN_FILE", tokenFile);
  vi.stubEnv("YOUTUBE_UPLOAD_ENABLED", "true");
  vi.stubEnv("YOUTUBE_QUOTA_READY", "true");
  vi.stubEnv("YOUTUBE_ACCOUNT_READY", "true");
  vi.stubEnv("YOUTUBE_POLICY_READY", "true");
  vi.stubEnv("PUBLIC_UPLOAD_ENABLED", "false");
}

describe("YouTube uploads page readiness panel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (tempTokenDir) {
      rmSync(tempTokenDir, { recursive: true, force: true });
      tempTokenDir = "";
    }
  });

  test("renders Korean readiness diagnostics with private or unlisted gates only", async () => {
    clearYouTubeEnv();

    render(await UploadsPage());

    expect(screen.getByRole("heading", { name: "업로드 준비 대시보드" })).toBeInTheDocument();
    expect(screen.getByText("왜 실행이 막혔나요?")).toBeInTheDocument();
    expect(screen.getByText("서버 환경 설정 안내")).toBeInTheDocument();
    expect(screen.getByText("스모크 실행 전 수동 확인")).toBeInTheDocument();
    expect(screen.getAllByText("YouTube OAuth 제공자 설정").length).toBeGreaterThan(0);
    expect(screen.getAllByText("YouTube 할당량 준비").length).toBeGreaterThan(0);
    expect(screen.getAllByText("YouTube 계정/채널 준비").length).toBeGreaterThan(0);
    expect(screen.getAllByText("업로드 정책 준비").length).toBeGreaterThan(0);
    expect(screen.getAllByText("업로드 토큰 준비").length).toBeGreaterThan(0);
    expect(screen.getAllByText("YouTube 업로드 기능 플래그").length).toBeGreaterThan(0);
    expect(screen.getAllByText("공개 업로드 차단").length).toBeGreaterThan(0);
    expect(screen.getByText("YOUTUBE_TOKEN_FILE")).toBeInTheDocument();
    expect(screen.getByText("YOUTUBE_QUOTA_READY")).toBeInTheDocument();
    expect(screen.getByText("PUBLIC_UPLOAD_ENABLED")).toBeInTheDocument();
    expect(screen.getAllByText(APPROVE_YOUTUBE_PRIVATE_UPLOAD).length).toBeGreaterThan(0);
    expect(screen.getAllByText(RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "YouTube 비공개 업로드 스모크" })).toBeInTheDocument();
    expect(screen.getByLabelText("후보 ID")).toHaveValue(YOUTUBE_PRIVATE_SMOKE_CANDIDATE_ID);
    expect(String(screen.getByLabelText("영상 파일 경로").getAttribute("value"))).toContain("youtube-private-smoke-001.mp4");
    expect(screen.getByRole("option", { name: "공개 업로드 차단" })).toBeDisabled();
    expect(screen.getByText("쿠팡파트너스 포함")).toBeInTheDocument();
    expect(screen.getByText("수수료 포함")).toBeInTheDocument();
    expect(screen.getByText("깨진 물음표 패턴 없음")).toBeInTheDocument();
    expect(screen.getAllByText(/UTF-8 브라우저 payload/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "업로드 준비 확인" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "실제 업로드 실행" })).toBeDisabled();
    expect(screen.getByText("실행 불가 사유")).toBeInTheDocument();
    expect(screen.getByText(/YouTube readiness가 통과하지 않았습니다/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/refresh token/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/configured-client-secret/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Authorization: Bearer/i)).not.toBeInTheDocument();
  });

  test("blocks garbled disclosure before dashboard prepare", async () => {
    clearYouTubeEnv();

    render(await UploadsPage());

    fireEvent.change(screen.getByLabelText("제휴 고지 미리보기"), {
      target: { value: "? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????." }
    });

    expect(screen.getByText(/disclosure_text_garbled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "업로드 준비 확인" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "실제 업로드 실행" })).toBeDisabled();
  });

  test("uses browser fetch for prepare and keeps execute gated by readiness and exact phrases", async () => {
    clearYouTubeEnv();
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/api/uploads/youtube/prepare")) {
        return Response.json({
          ok: true,
          request: { candidate_id: YOUTUBE_PRIVATE_SMOKE_CANDIDATE_ID, visibility: "private" },
          side_effects: {
            external_api_called: false,
            youtube_upload_executed: false,
            uploaded: false,
            public_upload_enabled: false
          },
          approval_required: true
        });
      }
      if (String(url).includes("/api/uploads/youtube/execute-readiness")) {
        return Response.json({
          ok: true,
          can_execute: false,
          blocked_reasons: ["live_smoke_approval_missing"],
          gates: [{ key: "execute_live_smoke_approval", status: "blocked", label_ko: "비공개 스모크 실행 승인" }],
          side_effects: { external_api_called: false, youtube_upload_executed: false, uploaded: false }
        });
      }
      return Response.json({ ok: false }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(await UploadsPage());

    fireEvent.click(screen.getByRole("button", { name: "업로드 준비 확인" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/uploads/youtube/prepare");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
    expect(screen.getByText(/Prepare 통과/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "실제 업로드 실행" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("업로드 승인 문구"), {
      target: { value: APPROVE_YOUTUBE_PRIVATE_UPLOAD }
    });
    fireEvent.change(screen.getByLabelText("스모크 실행 승인 문구"), {
      target: { value: RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE }
    });
    expect(screen.getByRole("button", { name: "실제 업로드 실행" })).toBeDisabled();
    expect(screen.getByText(/YouTube readiness가 통과하지 않았습니다/)).toBeInTheDocument();
  });

  test("enables execute only after readiness, prepare, and both approval phrases pass", async () => {
    clearYouTubeEnv();
    setReadyYouTubeEnv();
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/api/uploads/youtube/prepare")) {
        return Response.json({
          ok: true,
          side_effects: {
            external_api_called: false,
            youtube_upload_executed: false,
            uploaded: false,
            public_upload_enabled: false
          }
        });
      }
      if (String(url).includes("/api/uploads/youtube/execute-readiness")) {
        return Response.json({
          ok: true,
          can_execute: true,
          blocked_reasons: [],
          gates: [{ key: "execute_live_smoke_approval", status: "pass", label_ko: "비공개 스모크 실행 승인" }],
          side_effects: { external_api_called: false, youtube_upload_executed: false, uploaded: false }
        });
      }
      return Response.json({
        ok: false,
        error_code: "TEST_BLOCKED",
        readiness: { blocked_reasons: ["test_blocked_without_live_upload"] },
        side_effects: { external_api_called: false, youtube_upload_executed: false, uploaded: false }
      }, { status: 400 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(await UploadsPage());

    fireEvent.click(screen.getByRole("button", { name: "업로드 준비 확인" }));
    await waitFor(() => expect(screen.getByText(/Prepare 통과/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("업로드 승인 문구"), {
      target: { value: APPROVE_YOUTUBE_PRIVATE_UPLOAD }
    });
    fireEvent.change(screen.getByLabelText("스모크 실행 승인 문구"), {
      target: { value: RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE }
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "실제 업로드 실행" })).toBeEnabled());
  });

  test("keeps execute disabled when server execute readiness dry-run is blocked", async () => {
    clearYouTubeEnv();
    setReadyYouTubeEnv();
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/api/uploads/youtube/prepare")) {
        return Response.json({
          ok: true,
          side_effects: {
            external_api_called: false,
            youtube_upload_executed: false,
            uploaded: false,
            public_upload_enabled: false
          }
        });
      }
      if (String(url).includes("/api/uploads/youtube/execute-readiness")) {
        return Response.json({
          ok: true,
          can_execute: false,
          blocked_reasons: ["live_smoke_approval_missing"],
          gates: [{ key: "execute_live_smoke_approval", status: "blocked", label_ko: "비공개 스모크 실행 승인" }],
          side_effects: { external_api_called: false, youtube_upload_executed: false, uploaded: false }
        });
      }
      return Response.json({ ok: false }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(await UploadsPage());

    fireEvent.click(screen.getByRole("button", { name: "업로드 준비 확인" }));
    await waitFor(() => expect(screen.getByText(/Prepare 통과/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("업로드 승인 문구"), {
      target: { value: APPROVE_YOUTUBE_PRIVATE_UPLOAD }
    });
    fireEvent.change(screen.getByLabelText("스모크 실행 승인 문구"), {
      target: { value: RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE }
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/uploads/youtube/execute-readiness"),
      expect.objectContaining({ method: "POST" })
    ));
    expect(screen.getByRole("button", { name: "실제 업로드 실행" })).toBeDisabled();
    expect(screen.getAllByText(/live_smoke_approval_missing/).length).toBeGreaterThan(0);
  });

  test("result verification requires youtube_video_id and Korean disclosure verification", async () => {
    clearYouTubeEnv();
    render(await UploadsPage());

    expect(screen.getByText(/최종 검증 완료/i).closest("div")).toHaveTextContent("false");
    fireEvent.click(screen.getByLabelText(/Studio visibility가 private/i));
    fireEvent.click(screen.getByLabelText(/Studio 제목 확인 완료/i));
    fireEvent.click(screen.getByLabelText(/한국어 제휴 고지 확인 완료/i));
    expect(screen.getByText(/최종 검증 완료/i).closest("div")).toHaveTextContent("false");
  });
});
