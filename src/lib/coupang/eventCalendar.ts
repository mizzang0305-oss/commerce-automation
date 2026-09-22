export interface EventWindow {
  startDate: string;
  endDate: string;
  timezone: "Asia/Seoul";
  daysAhead: 30;
}

export interface CommerceEvent {
  eventId: string;
  name: string;
  date?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  type:
    | "holiday"
    | "anniversary"
    | "season"
    | "festival"
    | "performance"
    | "school"
    | "weather"
    | "shopping";
  confidence: "high" | "medium" | "low";
  source: "static_calendar" | "web_search" | "manual_seed" | "seasonal_rule";
}

const GENG_DAY_REFERENCE = "2026-07-15";

export function buildRollingEventWindow(input: { today?: string | Date; daysAhead?: 30 } = {}): EventWindow {
  const startDate = toKstDateString(input.today ?? new Date());
  return {
    startDate,
    endDate: addDays(startDate, input.daysAhead ?? 30),
    timezone: "Asia/Seoul",
    daysAhead: 30
  };
}

export function listCommerceEventsForWindow(
  window: EventWindow,
  input: { dynamicEvents?: CommerceEvent[] } = {}
): CommerceEvent[] {
  const years = yearsInWindow(window);
  const events = [
    ...years.flatMap(staticEventsForYear),
    ...(input.dynamicEvents ?? []).filter(isRecognizedCommerceEvent)
  ];
  const uniqueEvents = new Map<string, CommerceEvent>();
  for (const event of events) {
    uniqueEvents.set(`${event.eventId}:${eventStart(event)}:${eventEnd(event)}`, event);
  }
  return [...uniqueEvents.values()]
    .filter((event) => intersectsWindow(event, window))
    .sort((a, b) => eventPriority(b) - eventPriority(a) || eventStart(a).localeCompare(eventStart(b)));
}

function staticEventsForYear(year: number): CommerceEvent[] {
  const lunarNewYear = findDangiDate(year, 1, 1);
  const buddhasBirthday = findDangiDate(year, 4, 8);
  const chuseok = findDangiDate(year, 8, 15);
  const sambok = buildSambokEvents(year);
  const csatDate = nthWeekdayOfMonth(year, 11, 4, 3);
  return [
    fixedEvent("new-year-prep", "새해·신정 준비", `${year}-01-01`, "shopping"),
    ...(lunarNewYear ? [rangeEvent("seollal", "설날 연휴·선물 준비", addDays(lunarNewYear, -1), addDays(lunarNewYear, 1), "holiday", "static_calendar")] : []),
    rangeEvent("winter-break-end", "겨울방학 종료·개학 준비", `${year}-02-15`, `${year}-02-28`, "school", "seasonal_rule"),
    rangeEvent("valentine", "밸런타인데이 선물 시즌", `${year}-02-01`, `${year}-02-14`, "anniversary", "static_calendar"),
    fixedEvent("independence-movement-day", "삼일절", `${year}-03-01`, "holiday"),
    rangeEvent("spring-school", "신학기·입학 준비", `${year}-02-20`, `${year}-03-15`, "school", "seasonal_rule"),
    fixedEvent("white-day", "화이트데이 선물 시즌", `${year}-03-14`, "anniversary"),
    rangeEvent("spring-moving", "봄 이사·정리 시즌", `${year}-04-01`, `${year}-04-30`, "season", "seasonal_rule"),
    fixedEvent("children-day", "어린이날", `${year}-05-05`, "holiday"),
    fixedEvent("parents-day", "어버이날", `${year}-05-08`, "anniversary"),
    fixedEvent("teachers-day", "스승의날", `${year}-05-15`, "anniversary"),
    ...(buddhasBirthday ? [fixedEvent("buddhas-birthday", "부처님오신날", buddhasBirthday, "holiday")] : []),
    rangeEvent("couple-day", "부부의날 선물 시즌", `${year}-05-15`, `${year}-05-21`, "anniversary", "static_calendar"),
    fixedEvent("memorial-day", "현충일", `${year}-06-06`, "holiday"),
    rangeEvent("summer-prep", "여름 준비", `${year}-06-01`, `${year}-06-30`, "season", "seasonal_rule"),
    rangeEvent("rainy-season", "장마 대비", `${year}-06-15`, `${year}-07-20`, "weather", "seasonal_rule"),
    rangeEvent("summer-vacation", "여름휴가·물놀이 시즌", `${year}-07-01`, `${year}-08-20`, "season", "seasonal_rule"),
    rangeEvent("summer-break-start", "여름방학 시작", `${year}-07-15`, `${year}-07-31`, "school", "seasonal_rule"),
    fixedEvent("constitution-day", "제헌절", `${year}-07-17`, "anniversary"),
    ...sambok,
    rangeEvent("camping-season", "캠핑·야외활동 시즌", `${year}-07-01`, `${year}-10-20`, "season", "seasonal_rule"),
    fixedEvent("liberation-day", "광복절", `${year}-08-15`, "holiday"),
    rangeEvent("summer-break-end", "여름방학 종료·2학기 준비", `${year}-08-15`, `${year}-08-31`, "school", "seasonal_rule"),
    rangeEvent("fall-school", "2학기·가을 신학기 준비", `${year}-08-15`, `${year}-09-05`, "school", "seasonal_rule"),
    ...(chuseok ? [
      rangeEvent("chuseok-prep", "추석 선물·명절 준비", addDays(chuseok, -21), addDays(chuseok, -2), "holiday", "seasonal_rule"),
      rangeEvent("chuseok", "추석 연휴", addDays(chuseok, -1), addDays(chuseok, 1), "holiday", "static_calendar")
    ] : []),
    fixedEvent("national-foundation-day", "개천절", `${year}-10-03`, "holiday"),
    fixedEvent("hangul-day", "한글날", `${year}-10-09`, "holiday"),
    rangeEvent("fall-camping", "가을 캠핑 시즌", `${year}-10-01`, `${year}-10-31`, "season", "seasonal_rule"),
    rangeEvent("kimjang", "김장·겨울 먹거리 준비", `${year}-11-01`, `${year}-11-30`, "season", "seasonal_rule"),
    fixedEvent("pepero-day", "빼빼로데이 선물 시즌", `${year}-11-11`, "anniversary"),
    fixedEvent("csat", "수능·시험 응원", csatDate, "school"),
    rangeEvent("winter-prep", "한파·겨울 준비", `${year}-11-15`, `${year}-12-31`, "weather", "seasonal_rule"),
    rangeEvent("winter-break-start", "겨울방학 시작", `${year}-12-20`, `${year}-12-31`, "school", "seasonal_rule"),
    rangeEvent("christmas-year-end", "크리스마스·연말 선물 시즌", `${year}-12-01`, `${year}-12-31`, "shopping", "static_calendar")
  ];
}

function buildSambokEvents(year: number): CommerceEvent[] {
  const summerSolstice = `${year}-06-21`;
  const startOfAutumn = `${year}-08-07`;
  return [
    fixedEvent("chobok", "초복", nthGengDayOnOrAfter(summerSolstice, 3), "season", "seasonal_rule"),
    fixedEvent("jungbok", "중복", nthGengDayOnOrAfter(summerSolstice, 4), "season", "seasonal_rule"),
    fixedEvent("malbok", "말복", nthGengDayOnOrAfter(startOfAutumn, 1), "season", "seasonal_rule")
  ];
}

function fixedEvent(
  eventId: string,
  name: string,
  date: string,
  type: CommerceEvent["type"],
  source: CommerceEvent["source"] = "static_calendar"
): CommerceEvent {
  return {
    eventId,
    name,
    date,
    type,
    confidence: source === "seasonal_rule" ? "medium" : "high",
    source
  };
}

function rangeEvent(
  eventId: string,
  name: string,
  start: string,
  end: string,
  type: CommerceEvent["type"],
  source: CommerceEvent["source"]
): CommerceEvent {
  return {
    eventId,
    name,
    dateRange: { start, end },
    type,
    confidence: source === "seasonal_rule" ? "medium" : "high",
    source
  };
}

function intersectsWindow(event: CommerceEvent, window: EventWindow) {
  const start = eventStart(event);
  const end = eventEnd(event);
  return Boolean(start && end && start <= window.endDate && end >= window.startDate);
}

function eventPriority(event: CommerceEvent) {
  const typeScore: Record<CommerceEvent["type"], number> = {
    weather: 35,
    holiday: 32,
    season: 30,
    school: 26,
    anniversary: 22,
    shopping: 20,
    festival: 15,
    performance: 12
  };
  const confidenceScore = event.confidence === "high" ? 10 : event.confidence === "medium" ? 5 : 0;
  const sourceScore = event.source === "seasonal_rule" ? 4 : event.source === "static_calendar" ? 3 : 1;
  return typeScore[event.type] + confidenceScore + sourceScore;
}

function eventStart(event: CommerceEvent) {
  return event.dateRange?.start ?? event.date ?? "9999-12-31";
}

function eventEnd(event: CommerceEvent) {
  return event.dateRange?.end ?? event.date ?? "9999-12-31";
}

function yearsInWindow(window: EventWindow) {
  const startYear = Number(window.startDate.slice(0, 4));
  const endYear = Number(window.endDate.slice(0, 4));
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function findDangiDate(relatedYear: number, lunarMonth: number, lunarDay: number) {
  const formatter = new Intl.DateTimeFormat("en-u-ca-dangi", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul"
  });
  let date = new Date(Date.UTC(relatedYear, 0, 1));
  const end = new Date(Date.UTC(relatedYear, 11, 31));
  while (date <= end) {
    const parts = formatter.formatToParts(date);
    const year = Number(parts.find((part) => String(part.type) === "relatedYear")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    if (year === relatedYear && month === lunarMonth && day === lunarDay) {
      return formatDateOnly(date);
    }
    date = new Date(date.getTime() + 86_400_000);
  }
  return null;
}

function nthGengDayOnOrAfter(startDate: string, occurrence: number) {
  let date = startDate;
  let found = 0;
  for (let offset = 0; offset < 60; offset += 1) {
    if (mod(daysBetween(GENG_DAY_REFERENCE, date), 10) === 0) {
      found += 1;
      if (found === occurrence) {
        return date;
      }
    }
    date = addDays(date, 1);
  }
  return startDate;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, occurrence: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = mod(weekday - first.getUTCDay(), 7) + (occurrence - 1) * 7;
  return formatDateOnly(new Date(Date.UTC(year, month - 1, 1 + offset)));
}

function addDays(dateString: string, days: number) {
  const date = parseDateOnly(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

function daysBetween(start: string, end: string) {
  return Math.round((parseDateOnly(end).getTime() - parseDateOnly(start).getTime()) / 86_400_000);
}

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function toKstDateString(value: string | Date) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function parseDateOnly(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isRecognizedCommerceEvent(event: CommerceEvent) {
  return Boolean(event.eventId && event.name && (event.date || event.dateRange));
}
