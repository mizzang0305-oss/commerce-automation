"use client";

import { useMemo, useState } from "react";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD,
  RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE
} from "@/lib/uploads/youtube/youtubeUploadGuards";
import { DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT } from "@/lib/uploads/youtube/productVideoUploadPackage";
import { validateYouTubeDisclosureText } from "@/lib/uploads/youtube/youtubeDisclosureTextGuard";

type Visibility = "private" | "unlisted";

type ProductPackageApiState = {
  status: "idle" | "loading" | "success" | "blocked";
  summary: string;
  details?: {
    ok?: boolean;
    error_code?: string;
    blocked_reasons?: string[];
    package?: {
      package_id?: string;
      title?: string;
      description?: string;
      visibility?: string;
      side_effects?: Record<string, unknown>;
    };
    readiness?: Record<string, unknown>;
    side_effects?: Record<string, unknown>;
    execute_in_this_pr?: boolean;
  };
};

const DEFAULT_PRODUCT_NAME = "쿠팡 상품 영상 패키지 예시";
const DEFAULT_AFFILIATE_URL = "https://link.coupang.com/a/product-video-package";
const DEFAULT_VIDEO_PATH =
  "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\output\\video-packages\\youtube-private-smoke-001\\youtube-private-smoke-001.mp4";

export function YouTubeProductVideoPackageFlow() {
  const [candidateId, setCandidateId] = useState("candidate-product-video-package-001");
  const [productName, setProductName] = useState(DEFAULT_PRODUCT_NAME);
  const [affiliateUrl, setAffiliateUrl] = useState(DEFAULT_AFFILIATE_URL);
  const [videoPath, setVideoPath] = useState(DEFAULT_VIDEO_PATH);
  const [assetId, setAssetId] = useState("product-private-package-001");
  const [assetProvider, setAssetProvider] = useState("signed_url");
  const [preparedVideoAssetUrl, setPreparedVideoAssetUrl] = useState("");
  const [assetServerAccessible, setAssetServerAccessible] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [title, setTitle] = useState(`[${DEFAULT_PRODUCT_NAME}] 실제 구매 전 확인 포인트`);
  const [description, setDescription] = useState("");
  const [disclosureText, setDisclosureText] = useState(DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT);
  const [studioVisibility, setStudioVisibility] = useState(false);
  const [studioTitle, setStudioTitle] = useState(false);
  const [studioDisclosure, setStudioDisclosure] = useState(false);
  const [studioAffiliate, setStudioAffiliate] = useState(false);
  const [noPublicState, setNoPublicState] = useState(true);
  const [prepareState, setPrepareState] = useState<ProductPackageApiState>({
    status: "idle",
    summary: "Product video package prepare has not run yet."
  });
  const [copyMessage, setCopyMessage] = useState("");

  const previewDescription = useMemo(() => {
    const base = description.trim() || [
      `상품명: ${productName}`,
      `제휴 링크: ${affiliateUrl}`,
      `쿠팡파트너스 고지: ${disclosureText}`
    ].join("\n");
    return base.includes(disclosureText) ? base : [base, disclosureText].filter(Boolean).join("\n\n");
  }, [affiliateUrl, description, disclosureText, productName]);

  const disclosureReasons = useMemo(
    () => validateYouTubeDisclosureText({ description: previewDescription, disclosure_text: disclosureText }),
    [disclosureText, previewDescription]
  );
  const domainAssetReady = Boolean(
    assetId.trim() &&
    assetProvider !== "local_dev" &&
    preparedVideoAssetUrl.trim().startsWith("https://") &&
    assetServerAccessible
  );
  const packageReady = Boolean(
    candidateId.trim()
    && productName.trim()
    && affiliateUrl.trim()
    && videoPath.trim()
    && title.trim()
    && previewDescription.trim()
    && disclosureReasons.length === 0
  );
  const finalVerified = Boolean(
    prepareState.details?.package?.package_id
    && studioVisibility
    && studioTitle
    && studioDisclosure
    && studioAffiliate
    && noPublicState
  );

  async function submitPrepare() {
    setPrepareState({ status: "loading", summary: "Preparing copy-only product video package." });
    try {
      const response = await fetch("/api/uploads/youtube/product-package/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          candidate_id: candidateId,
          product_name: productName,
          product_source: "coupang",
          selected_affiliate_url: affiliateUrl,
          video_path_or_url: videoPath,
          prepared_video_asset: {
            asset_id: assetId,
            provider: assetProvider,
            prepared_video_asset_url: preparedVideoAssetUrl,
            signed_url: preparedVideoAssetUrl,
            mime_type: "video/mp4",
            server_accessible: assetServerAccessible
          },
          visibility,
          title,
          description: previewDescription,
          disclosure_text: disclosureText,
          tags: ["coupang", "product video", "private upload"],
          made_for_kids: false
        })
      });
      const body = await response.json() as ProductPackageApiState["details"];
      setPrepareState({
        status: response.ok && body?.ok !== false ? "success" : "blocked",
        summary: response.ok && body?.ok !== false
          ? "Copy-only product video package is ready. Execute remains disabled in this PR."
          : "Product video package prepare is blocked.",
        details: body
      });
    } catch {
      setPrepareState({
        status: "blocked",
        summary: "Product video package prepare failed with a safe client error."
      });
    }
  }

  async function copyPackageJson() {
    const payload = prepareState.details?.package;
    if (!payload || typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyMessage("Package JSON is not ready to copy.");
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopyMessage("Package JSON copied. No upload was executed.");
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">product video private package</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">상품 영상 업로드 패키지</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            이 섹션은 실제 상품 영상의 YouTube private 업로드를 준비하는 copy-only/manual package flow입니다.
            이미지나 영상 생성, YouTube upload 실행, DB write, R2 upload, queue/job 생성은 하지 않습니다.
          </p>
        </div>
        <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">
          prepare-only
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <TextInput label="상품 후보 ID" value={candidateId} onChange={setCandidateId} />
          <TextInput label="상품명" value={productName} onChange={(value) => {
            setProductName(value);
            if (!title.trim() || title.includes(DEFAULT_PRODUCT_NAME)) {
              setTitle(value ? `[${value}] 실제 구매 전 확인 포인트` : "");
            }
          }} />
          <TextInput label="쿠팡 제휴 URL" value={affiliateUrl} onChange={setAffiliateUrl} />
          <TextInput label="영상 파일 또는 URL" value={videoPath} onChange={setVideoPath} />
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-bold">Local path is diagnostic only.</p>
            <p className="mt-1">
              Product package prepare requires a server-accessible asset ref for domain readiness. Local mp4 paths are
              retained only as localhost diagnostics.
            </p>
          </div>
          <TextInput label="prepared asset id" value={assetId} onChange={setAssetId} />
          <label className="text-sm font-semibold text-slate-700">
            prepared asset provider
            <select
              aria-label="product prepared asset provider"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={assetProvider}
              onChange={(event) => setAssetProvider(event.target.value)}
            >
              <option value="signed_url">signed_url</option>
              <option value="r2">r2</option>
              <option value="supabase_storage">supabase_storage</option>
              <option value="external_https">external_https</option>
              <option value="local_dev">local_dev diagnostic only</option>
            </select>
          </label>
          <TextInput label="prepared video asset URL" value={preparedVideoAssetUrl} onChange={setPreparedVideoAssetUrl} />
          <label className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={assetServerAccessible}
              onChange={(event) => setAssetServerAccessible(event.target.checked)}
            />
            server_accessible asset reference
          </label>
          <label className="text-sm font-semibold text-slate-700">
            공개 범위
            <select
              aria-label="상품 영상 공개 범위"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as Visibility)}
            >
              <option value="private">private</option>
              <option value="unlisted">unlisted</option>
              <option value="public" disabled>public disabled</option>
            </select>
          </label>
          <TextInput label="상품 영상 제목" value={title} onChange={setTitle} />
          <label className="text-sm font-semibold text-slate-700">
            설명 preview
            <textarea
              aria-label="상품 영상 설명 preview"
              className="mt-1 block min-h-36 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={previewDescription}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            쿠팡파트너스 고지 preview
            <textarea
              aria-label="상품 영상 쿠팡파트너스 고지 preview"
              className="mt-1 block min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={disclosureText}
              onChange={(event) => setDisclosureText(event.target.value)}
            />
          </label>
        </div>

        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">readiness</p>
          <dl className="space-y-2 text-sm">
            <StatusRow label="candidate_ready" value={Boolean(candidateId.trim())} />
            <StatusRow label="product_ready" value={Boolean(productName.trim())} />
            <StatusRow label="video_ready" value={domainAssetReady} />
            <StatusRow label="server_accessible_asset_ready" value={domainAssetReady} />
            <StatusRow label="local_path_only_is_domain_blocked" value={!domainAssetReady && Boolean(videoPath.trim())} />
            <StatusRow label="affiliate_url_ready" value={Boolean(affiliateUrl.trim())} />
            <StatusRow label="disclosure_ready" value={disclosureReasons.length === 0} />
            <StatusRow label="visibility_ready" value={visibility === "private" || visibility === "unlisted"} />
            <StatusRow label="public_upload_blocked" value />
          </dl>
          <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <p className="font-bold text-slate-950">필수 승인 문구</p>
            <code className="mt-2 block rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">
              {APPROVE_YOUTUBE_PRIVATE_UPLOAD}
            </code>
            <code className="mt-2 block rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">
              {RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE}
            </code>
          </div>
          {disclosureReasons.length > 0 ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
              {disclosureReasons.join(", ")}
            </div>
          ) : (
            <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-800">
              쿠팡파트너스 및 수수료 고지 문구가 prepare 가능한 상태입니다.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!packageReady || prepareState.status === "loading"}
              onClick={submitPrepare}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              상품 패키지 prepare
            </button>
            <button
              type="button"
              disabled
              className="rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-400"
            >
              Execute disabled in this PR
            </button>
            <button
              type="button"
              onClick={copyPackageJson}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800"
            >
              Copy package JSON
            </button>
          </div>
          {copyMessage ? <p className="text-sm font-semibold text-slate-700">{copyMessage}</p> : null}
          <ResultCard state={prepareState} />
        </div>
      </div>

      <div className="mt-4 rounded-md border border-slate-200 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Studio manual verification checklist</p>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <CheckboxRow label="private visibility confirmed" checked={studioVisibility} onChange={setStudioVisibility} />
          <CheckboxRow label="title correct" checked={studioTitle} onChange={setStudioTitle} />
          <CheckboxRow label="Korean disclosure correct" checked={studioDisclosure} onChange={setStudioDisclosure} />
          <CheckboxRow label="affiliate link text present" checked={studioAffiliate} onChange={setStudioAffiliate} />
          <CheckboxRow label="no public or scheduled state" checked={noPublicState} onChange={setNoPublicState} />
        </div>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <SettingRow label="youtube_video_id_required" value="true" />
          <SettingRow label="final_verified" value={String(finalVerified)} />
          <SettingRow label="external_api_called" value={String(prepareState.details?.side_effects?.external_api_called ?? false)} />
          <SettingRow label="youtube_upload_executed" value={String(prepareState.details?.side_effects?.youtube_upload_executed ?? false)} />
          <SettingRow label="uploaded" value={String(prepareState.details?.side_effects?.uploaded ?? false)} />
          <SettingRow label="upload_package_created" value={String(prepareState.details?.side_effects?.upload_package_created ?? false)} />
        </dl>
      </div>
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        aria-label={label}
        className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StatusRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className={value ? "font-bold text-teal-700" : "font-bold text-rose-700"}>{String(value)}</dd>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 font-semibold text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function ResultCard({ state }: { state: ProductPackageApiState }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Product package prepare result</p>
        <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700">{state.status}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-800">{state.summary}</p>
      {state.details ? (
        <dl className="mt-3 space-y-2 text-sm">
          <SettingRow label="ok" value={String(state.details.ok ?? state.status === "success")} />
          <SettingRow label="error_code" value={state.details.error_code ?? "none"} />
          <SettingRow label="blocked_reasons" value={(state.details.blocked_reasons ?? []).join(", ") || "none"} />
          <SettingRow label="package_id" value={state.details.package?.package_id ?? "not available"} />
          <SettingRow label="visibility" value={state.details.package?.visibility ?? "not available"} />
          <SettingRow label="execute_in_this_pr" value={String(state.details.execute_in_this_pr ?? false)} />
          <SettingRow label="external_api_called" value={String(state.details.side_effects?.external_api_called ?? false)} />
          <SettingRow label="db_written" value={String(state.details.side_effects?.db_written ?? false)} />
          <SettingRow label="r2_uploaded" value={String(state.details.side_effects?.r2_uploaded ?? false)} />
          <SettingRow label="worker_job_created" value={String(state.details.side_effects?.worker_job_created ?? false)} />
        </dl>
      ) : null}
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className="break-all text-right font-bold text-slate-950">{value}</dd>
    </div>
  );
}
