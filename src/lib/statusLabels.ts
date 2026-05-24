import type {
  ManualReviewStatus,
  QueueStatus,
  RunMode,
  ThreadsPostStatus,
  TikTokUploadStatus,
  WorkerJobStatus,
  WorkerJobType,
  YouTubeUploadStatus
} from "@/types/automation";

export const queueStatusLabels: Record<QueueStatus, string> = {
  scheduled: "예약됨",
  processing: "처리 중",
  content_ready: "콘텐츠 준비 완료",
  video_render_started: "영상 생성 중",
  video_ready: "영상 준비 완료",
  blog_draft_created: "블로그 초안 생성",
  ready_for_manual_upload: "수동 업로드 준비",
  uploaded: "수동 업로드 완료",
  posted: "수동 게시 완료",
  manual_review: "수동 검토",
  error: "오류",
  skipped: "건너뜀",
  hold: "보류"
};

export const workerJobStatusLabels: Record<WorkerJobStatus, string> = {
  pending: "대기",
  claimed: "할당됨",
  processing: "처리 중",
  completed: "완료",
  failed: "실패",
  retry_wait: "재시도 대기",
  cancelled: "취소"
};

export const workerJobTypeLabels: Record<WorkerJobType, string> = {
  video_render: "영상 생성",
  sheet_sync: "시트 동기화"
};

export const runModeLabels: Record<RunMode, string> = {
  generate_only: "생성 전용",
  youtube_private: "YouTube 비공개 준비",
  youtube_unlisted: "YouTube 일부 공개 준비",
  youtube_public: "위험: YouTube 공개 업로드 모드"
};

type UploadStatus = YouTubeUploadStatus | TikTokUploadStatus | ThreadsPostStatus | ManualReviewStatus;

export const uploadStatusLabels: Record<UploadStatus, string> = {
  not_ready: "준비 안 됨",
  ready_to_upload: "업로드 준비",
  private_uploaded: "비공개 업로드 완료",
  unlisted_uploaded: "일부 공개 업로드 완료",
  public_uploaded: "공개 업로드 완료",
  manual_review: "수동 검토",
  blocked: "차단됨",
  error: "오류",
  uploaded: "업로드 완료",
  ready_to_post: "게시 준비",
  posted: "게시 완료",
  ready_for_review: "검토 준비",
  approved: "승인됨",
  rejected: "반려됨"
};

export function getQueueStatusLabel(status: QueueStatus) {
  return queueStatusLabels[status] ?? status;
}

export function getWorkerJobStatusLabel(status: WorkerJobStatus) {
  return workerJobStatusLabels[status] ?? status;
}

export function getWorkerJobTypeLabel(type: WorkerJobType) {
  return workerJobTypeLabels[type] ?? type;
}

export function getRunModeLabel(mode: RunMode) {
  return runModeLabels[mode] ?? mode;
}

export function getUploadStatusLabel(status: UploadStatus) {
  return uploadStatusLabels[status] ?? status;
}

export function getBooleanStatusLabel(value: boolean) {
  return value ? "예" : "아니오";
}
