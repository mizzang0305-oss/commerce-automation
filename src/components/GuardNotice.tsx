import type { AutomationSettings, ProductQueueItem } from "@/types/automation";
import { canUploadToYouTube, getUploadGuardMessage } from "@/lib/guards";

export function GuardNotice({
  settings,
  item,
  publicUploadsToday = 0
}: {
  settings: AutomationSettings;
  item?: ProductQueueItem;
  publicUploadsToday?: number;
}) {
  const result = item
    ? canUploadToYouTube(settings, item, publicUploadsToday)
    : {
        ok: false,
        message: settings.youtube_upload_enabled
          ? "영상과 블로그 초안은 자동 생성되며, 유튜브 공개 업로드는 승인 후 진행됩니다."
          : "현재 자동 업로드는 비활성화되어 있습니다."
      };
  const capacityMessage = item ? getUploadGuardMessage(settings, item, publicUploadsToday) : result.message;

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-amber-950">안전 가드</h2>
          <p className="mt-2 text-sm font-medium text-amber-900">{capacityMessage}</p>
          <p className="mt-1 text-sm text-amber-800">
            영상과 블로그 초안은 자동 생성되며, 유튜브 공개 업로드는 승인 후 진행됩니다.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            하루 공개 업로드 제한을 초과하면 업로드 큐에 보류됩니다.
          </p>
        </div>
        <button
          type="button"
          disabled
          className="focus-ring rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-500"
        >
          자동 공개 업로드 비활성화
        </button>
      </div>
    </section>
  );
}
