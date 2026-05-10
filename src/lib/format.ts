export function formatDateTime(value?: string | Date | null): string {
  if (!value) {
    return "-";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatDuration(startedAt: string, finishedAt: string): string {
  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();

  if (Number.isNaN(started) || Number.isNaN(finished) || finished < started) {
    return "-";
  }

  const seconds = Math.round((finished - started) / 1000);
  return `${seconds}s`;
}

export function toDateInputValue(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}
