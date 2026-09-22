export const COMMERCE_DAILY_KST_SLOTS = [
  { id: "morning_commute", label: "아침 출근", local_time: "07:30", product_rank: 0 },
  { id: "lunch_break", label: "점심 휴식", local_time: "12:20", product_rank: 1 },
  { id: "evening_commute", label: "저녁 퇴근", local_time: "18:30", product_rank: 2 },
  { id: "before_bed", label: "자기 전", local_time: "22:30", product_rank: 3 }
] as const;

export type CommerceDailySlotId = (typeof COMMERCE_DAILY_KST_SLOTS)[number]["id"];

export function getCommerceDailySlot(slotId: string) {
  const slot = COMMERCE_DAILY_KST_SLOTS.find((candidate) => candidate.id === slotId);
  if (!slot) {
    throw new Error(`COMMERCE_DAILY_SLOT_INVALID:${slotId}`);
  }
  return slot;
}

export function getKstDateString(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("COMMERCE_DAILY_DATE_INVALID");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function buildCommerceDailyScheduleId(input: {
  date?: string | Date;
  slotId: CommerceDailySlotId;
}) {
  return `commerce-daily-${getKstDateString(input.date)}-${getCommerceDailySlot(input.slotId).id}`;
}
