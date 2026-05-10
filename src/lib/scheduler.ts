import type { AutomationSettings, ProductQueueItem } from "@/types/automation";

export type UploadSlot = {
  index: number;
  hour: number;
  capacity: number;
};

function getSlotHours(settings: AutomationSettings): number[] {
  const hours: number[] = [];
  const interval = Math.max(1, settings.interval_hours);

  if (settings.start_hour <= settings.end_hour) {
    for (let hour = settings.start_hour; hour <= settings.end_hour; hour += interval) {
      hours.push(hour);
    }
    return hours;
  }

  for (let hour = settings.start_hour; hour <= 23; hour += interval) {
    hours.push(hour);
  }
  for (let hour = 0; hour <= settings.end_hour; hour += interval) {
    hours.push(hour);
  }
  return hours;
}

export function calculateUploadSlots(settings: AutomationSettings): UploadSlot[] {
  const hours = getSlotHours(settings);

  return hours.map((hour, index) => ({
    index: index + 1,
    hour,
    capacity: settings.batch_size
  }));
}

export function getAvailableSlotCount(settings: AutomationSettings): number {
  return calculateUploadSlots(settings).length;
}

export function getDailyCapacity(settings: AutomationSettings): number {
  return calculateUploadSlots(settings).length * settings.batch_size;
}

export function getDailyCapacityWarning(settings: AutomationSettings): string | null {
  const capacity = getDailyCapacity(settings);

  if (capacity >= settings.daily_target_count) {
    return null;
  }

  return `현재 설정으로는 하루 ${settings.daily_target_count}개를 모두 처리할 수 없습니다. 처리 가능량: ${capacity}개`;
}

export function getNextRunAt(settings: AutomationSettings, now = new Date()): Date {
  const hours = calculateUploadSlots(settings).map((slot) => slot.hour);
  const today = new Date(now);

  for (const hour of hours) {
    const candidate = new Date(today);
    candidate.setHours(hour, 0, 0, 0);
    if (candidate > now) {
      return candidate;
    }
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(hours[0] ?? settings.start_hour, 0, 0, 0);
  return tomorrow;
}

export function assignSlots(items: ProductQueueItem[], settings: AutomationSettings): ProductQueueItem[] {
  const slots = calculateUploadSlots(settings);
  const baseDate = items[0]?.queue_date ?? new Date().toISOString().slice(0, 10);

  return items.map((item, index) => {
    const slot = slots[Math.floor(index / settings.batch_size) % slots.length] ?? slots[slots.length - 1];
    const scheduledAt = new Date(`${baseDate}T00:00:00`);
    scheduledAt.setHours(slot?.hour ?? settings.start_hour, 0, 0, 0);

    return {
      ...item,
      upload_slot: slot?.index ?? 1,
      scheduled_at: scheduledAt.toISOString()
    };
  });
}

export function getDueItems(
  queue: ProductQueueItem[],
  settings: AutomationSettings,
  now = new Date()
): ProductQueueItem[] {
  if (settings.is_paused) {
    return [];
  }

  return queue
    .filter((item) => {
      if (["error", "skipped", "hold", "uploaded", "posted", "manual_review"].includes(item.queue_status)) {
        return false;
      }
      return new Date(item.scheduled_at) <= now;
    })
    .slice(0, settings.batch_size);
}
