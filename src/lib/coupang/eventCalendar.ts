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
  return events
    .filter((event) => intersectsWindow(event, window))
    .sort((a, b) => eventPriority(b) - eventPriority(a) || eventStart(a).localeCompare(eventStart(b)));
}

function staticEventsForYear(year: number): CommerceEvent[] {
  return [
    fixedEvent("new-year-prep", "New Year preparation", `${year}-01-01`, "shopping"),
    rangeEvent("valentine", "Valentine Day gift season", `${year}-02-01`, `${year}-02-14`, "anniversary", "static_calendar"),
    rangeEvent("spring-school", "Spring school start", `${year}-02-20`, `${year}-03-15`, "school", "seasonal_rule"),
    fixedEvent("white-day", "White Day gift season", `${year}-03-14`, "anniversary"),
    rangeEvent("spring-moving", "Spring moving and organization season", `${year}-04-01`, `${year}-04-30`, "season", "seasonal_rule"),
    fixedEvent("children-day", "Children's Day", `${year}-05-05`, "holiday"),
    fixedEvent("parents-day", "Parents' Day", `${year}-05-08`, "anniversary"),
    fixedEvent("teachers-day", "Teachers' Day", `${year}-05-15`, "anniversary"),
    rangeEvent("couple-day", "Couple Day gift season", `${year}-05-15`, `${year}-05-21`, "anniversary", "static_calendar"),
    rangeEvent("summer-prep", "Summer preparation", `${year}-06-01`, `${year}-06-30`, "season", "seasonal_rule"),
    rangeEvent("rainy-season", "Rainy season preparation", `${year}-06-15`, `${year}-07-20`, "weather", "seasonal_rule"),
    rangeEvent("summer-vacation", "Summer vacation and water-play season", `${year}-07-01`, `${year}-08-15`, "season", "seasonal_rule"),
    fixedEvent("chobok", "Chobok summer heat season", `${year}-07-15`, "season"),
    fixedEvent("jungbok", "Jungbok summer heat season", `${year}-07-25`, "season"),
    fixedEvent("malbok", "Malbok summer heat season", `${year}-08-14`, "season"),
    rangeEvent("camping-season", "Camping and outdoor season", `${year}-07-01`, `${year}-10-20`, "season", "seasonal_rule"),
    rangeEvent("fall-school", "Fall school preparation", `${year}-08-15`, `${year}-09-05`, "school", "seasonal_rule"),
    rangeEvent("chuseok-prep", "Chuseok gift preparation", `${year}-09-01`, `${year}-09-30`, "holiday", "seasonal_rule"),
    rangeEvent("fall-camping", "Fall camping season", `${year}-10-01`, `${year}-10-31`, "season", "seasonal_rule"),
    fixedEvent("pepero-day", "Pepero Day gift season", `${year}-11-11`, "anniversary"),
    rangeEvent("kimjang", "Kimjang and winter food prep", `${year}-11-01`, `${year}-11-30`, "season", "seasonal_rule"),
    rangeEvent("christmas-year-end", "Christmas and year-end gift season", `${year}-12-01`, `${year}-12-31`, "shopping", "static_calendar")
  ];
}

function fixedEvent(eventId: string, name: string, date: string, type: CommerceEvent["type"]): CommerceEvent {
  return {
    eventId,
    name,
    date,
    type,
    confidence: "high",
    source: "static_calendar"
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
  const start = event.dateRange?.start ?? event.date ?? "";
  const end = event.dateRange?.end ?? event.date ?? "";
  return Boolean(start && end && start <= window.endDate && end >= window.startDate);
}

function eventPriority(event: CommerceEvent) {
  const typeScore: Record<CommerceEvent["type"], number> = {
    weather: 35,
    season: 30,
    holiday: 25,
    anniversary: 22,
    shopping: 20,
    school: 18,
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

function yearsInWindow(window: EventWindow) {
  const startYear = Number(window.startDate.slice(0, 4));
  const endYear = Number(window.endDate.slice(0, 4));
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
}

function addDays(dateString: string, days: number) {
  const date = parseDateOnly(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
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
