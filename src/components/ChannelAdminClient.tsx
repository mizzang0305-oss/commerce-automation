"use client";

import { useMemo, useState } from "react";
import type { ChannelProfile } from "@/types/automation";
import type { YouTubeChannelReadiness } from "@/lib/channels/channelProfileAdmin";

export type ChannelPackageCounts = Record<string, {
  manual_ready: number;
  uploaded: number;
  needs_fix: number;
}>;

type EditableProfile = Pick<
  ChannelProfile,
  | "channel_name"
  | "youtube_channel_id"
  | "youtube_handle"
  | "niche"
  | "allowed_categories"
  | "excluded_categories"
  | "default_hashtags"
  | "title_template"
  | "description_template"
  | "hashtag_template"
  | "pinned_comment_template"
  | "upload_window"
  | "status"
>;

export function ChannelAdminClient({
  profiles,
  packageCounts,
  youtubeReadiness
}: {
  profiles: ChannelProfile[];
  packageCounts: ChannelPackageCounts;
  youtubeReadiness: YouTubeChannelReadiness;
}) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? "");
  const selectedProfile = profiles.find((profile) => profile.id === selectedId) ?? profiles[0] ?? null;
  const [drafts, setDrafts] = useState<Record<string, EditableProfile>>(() =>
    Object.fromEntries(profiles.map((profile) => [profile.id, toEditableProfile(profile)]))
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const draft = selectedProfile ? drafts[selectedProfile.id] : null;
  const counts = selectedProfile ? packageCounts[selectedProfile.id] ?? { manual_ready: 0, uploaded: 0, needs_fix: 0 } : { manual_ready: 0, uploaded: 0, needs_fix: 0 };
  const oauthLabel = youtubeReadiness.oauth_configured ? "OAuth 준비됨" : "OAuth 준비 안 됨";
  const manualOnlyCount = useMemo(() => profiles.filter((profile) => profile.manual_upload_only).length, [profiles]);

  function updateDraft<K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) {
    if (!selectedProfile) {
      return;
    }
    setDrafts((current) => ({
      ...current,
      [selectedProfile.id]: {
        ...current[selectedProfile.id],
        [key]: value
      }
    }));
  }

  async function saveProfile() {
    if (!selectedProfile || !draft) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/channels/${selectedProfile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          upload_enabled: false,
          manual_upload_only: true
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setMessage(typeof payload.message === "string" ? payload.message : "채널 프로필 저장에 실패했습니다.");
        return;
      }
      setMessage("채널 프로필을 저장했습니다. 자동 업로드는 비활성화 상태입니다.");
    } catch {
      setMessage("채널 프로필 저장 요청에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (!selectedProfile || !draft) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
        등록된 채널 프로필이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">채널 관리</h1>
        <p className="mt-2 text-sm text-slate-500">
          채널 프로필은 수동 업로드 패키지의 제목, 설명, 해시태그, 라우팅을 정리하는 운영 메타데이터입니다.
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Summary label="전체 채널" value={profiles.length} />
        <Summary label="수동 전용" value={manualOnlyCount} />
        <Summary label="수동 업로드 준비" value={counts.manual_ready} />
        <Summary label="수정 필요" value={counts.needs_fix} />
      </section>

      <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
        <span>{oauthLabel}</span>
        <span className="ml-3 inline-flex rounded-full bg-white px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200">upload_enabled=false</span>
        <span className="ml-2 inline-flex rounded-full bg-white px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200">manual_upload_only=true</span>
      </section>

      <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <h2 className="px-2 text-sm font-bold text-slate-900">채널 목록</h2>
          <div className="mt-3 space-y-2">
            {profiles.map((profile) => {
              const profileCounts = packageCounts[profile.id] ?? { manual_ready: 0, uploaded: 0, needs_fix: 0 };
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedId(profile.id)}
                  className={`focus-ring w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    profile.id === selectedProfile.id ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <span className="block font-bold text-slate-950">{profile.channel_name}</span>
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    수동 업로드 준비 {profileCounts.manual_ready} / 완료 {profileCounts.uploaded} / 수정 {profileCounts.needs_fix}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="채널명" value={draft.channel_name} onChange={(value) => updateDraft("channel_name", value)} />
            <TextInput label="YouTube 채널 ID" value={draft.youtube_channel_id} onChange={(value) => updateDraft("youtube_channel_id", value)} />
            <TextInput label="핸들" value={draft.youtube_handle} onChange={(value) => updateDraft("youtube_handle", value)} />
            <TextInput label="니치" value={draft.niche} onChange={(value) => updateDraft("niche", value)} />
            <ArrayInput label="허용 카테고리" value={draft.allowed_categories} onChange={(value) => updateDraft("allowed_categories", value)} />
            <ArrayInput label="제외 카테고리" value={draft.excluded_categories} onChange={(value) => updateDraft("excluded_categories", value)} />
            <ArrayInput label="기본 해시태그" value={draft.default_hashtags} onChange={(value) => updateDraft("default_hashtags", value)} />
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label="업로드 시작시" value={hourValue(draft.upload_window.start_hour, 9)} onChange={(value) => updateDraft("upload_window", { ...draft.upload_window, start_hour: value })} />
              <NumberInput label="업로드 종료시" value={hourValue(draft.upload_window.end_hour, 21)} onChange={(value) => updateDraft("upload_window", { ...draft.upload_window, end_hour: value })} />
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <TextArea label="제목 템플릿" value={draft.title_template ?? ""} onChange={(value) => updateDraft("title_template", value)} />
            <TextArea label="설명 템플릿" value={draft.description_template ?? ""} onChange={(value) => updateDraft("description_template", value)} />
            <TextArea label="해시태그 템플릿" value={draft.hashtag_template ?? ""} onChange={(value) => updateDraft("hashtag_template", value)} />
            <TextArea label="고정 댓글 초안" value={draft.pinned_comment_template ?? ""} onChange={(value) => updateDraft("pinned_comment_template", value)} />
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            사용 가능한 토큰: {"{product_name}"}, {"{video_title}"}, {"{description}"}, {"{affiliate_url}"}, {"{disclosure_text}"}, {"{hashtags}"}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="focus-ring rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? "저장 중" : "채널 프로필 저장"}
            </button>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
              실제 업로드 API 없음
            </span>
          </div>
          {message ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{message}</p> : null}
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
    </label>
  );
}

function ArrayInput({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <TextInput
      label={label}
      value={value.join(", ")}
      onChange={(next) => onChange(next.split(",").map((entry) => entry.trim()).filter(Boolean))}
    />
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        type="number"
        min={0}
        max={23}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      />
    </label>
  );
}

function toEditableProfile(profile: ChannelProfile): EditableProfile {
  return {
    channel_name: profile.channel_name,
    youtube_channel_id: profile.youtube_channel_id,
    youtube_handle: profile.youtube_handle,
    niche: profile.niche,
    allowed_categories: profile.allowed_categories,
    excluded_categories: profile.excluded_categories,
    default_hashtags: profile.default_hashtags,
    title_template: profile.title_template ?? "",
    description_template: profile.description_template ?? "",
    hashtag_template: profile.hashtag_template ?? "",
    pinned_comment_template: profile.pinned_comment_template ?? "",
    upload_window: profile.upload_window,
    status: profile.status
  };
}

function hourValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
