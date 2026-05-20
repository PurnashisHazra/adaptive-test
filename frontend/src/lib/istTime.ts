/** Platform display and input timezone: Indian Standard Time (IST). */

export const IST_TIMEZONE = "Asia/Kolkata";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const DATETIME_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: IST_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: IST_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
};

const IST_PARTS_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: IST_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

/** API/Mongo often returns UTC without a Z suffix; JS would treat that as local time. */
export function parseUtcInstant(iso: string | Date): Date {
  if (iso instanceof Date) return iso;
  const s = String(iso).trim();
  if (!s) return new Date(NaN);
  if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) {
    return new Date(s);
  }
  return new Date(`${s}Z`);
}

function parseDate(iso: string | Date): Date {
  return typeof iso === "string" ? parseUtcInstant(iso) : iso;
}

/** e.g. "20 May 2026, 2:30 pm IST" */
export function formatDateTimeIST(iso: string | Date): string {
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("en-IN", DATETIME_FORMAT)} IST`;
}

/** e.g. "20 May 2026 IST" */
export function formatDateIST(iso: string | Date): string {
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-IN", DATE_FORMAT)} IST`;
}

/** Current wall clock formatted in IST. */
export function formatNowIST(): string {
  return formatDateTimeIST(new Date());
}

/** YYYY-MM-DD in IST (for filenames). */
export function formatDateFilenameIST(iso: string | Date = new Date()): string {
  const d = parseDate(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function istPartsFromInstant(iso: string | Date): { y: string; m: string; d: string; hh: string; mm: string } {
  const instant = parseDate(iso);
  const parts = new Intl.DateTimeFormat("en-CA", IST_PARTS_FORMAT).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    hh: get("hour"),
    mm: get("minute"),
  };
}

/** Value for `<input type="datetime-local" />` — wall clock in IST (not browser local). */
export function toDatetimeLocalInputIST(iso: string): string {
  const { y, m, d, hh, mm } = istPartsFromInstant(iso);
  if (!y || !m || !d) return "";
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/** Parse datetime-local value as IST wall time and return UTC ISO string for the API. */
export function datetimeLocalInputToUtcIso(value: string): string {
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) {
    throw new Error("Invalid datetime");
  }
  const [y, m, d] = datePart.split("-").map((x) => Number(x));
  const [hh, mm] = timePart.split(":").map((x) => Number(x));
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) {
    throw new Error("Invalid datetime");
  }
  const asIfUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  return new Date(asIfUtcMs - IST_OFFSET_MS).toISOString();
}

/** Round datetime-local (IST) up to the next whole hour in IST. */
export function roundUpToNextHourDatetimeLocalIST(localValue: string): string {
  let ms = parseUtcInstant(datetimeLocalInputToUtcIso(localValue)).getTime();
  const { mm } = istPartsFromInstant(new Date(ms).toISOString());
  const minute = Number(mm);
  if (minute > 0) {
    ms += (60 - minute) * 60 * 1000;
  }
  return toDatetimeLocalInputIST(new Date(ms).toISOString());
}

/** Default launch (next hour IST) and end (+7 days) as datetime-local strings. */
export function defaultChallengeScheduleInputs(): { launch: string; end: string } {
  const nowLocal = toDatetimeLocalInputIST(new Date().toISOString());
  const launch = roundUpToNextHourDatetimeLocalIST(nowLocal);
  const launchIso = datetimeLocalInputToUtcIso(launch);
  const endMs = parseUtcInstant(launchIso).getTime() + 7 * 24 * 60 * 60 * 1000;
  const end = toDatetimeLocalInputIST(new Date(endMs).toISOString());
  return { launch, end };
}

/** Human-readable preview for a datetime-local field (confirms IST interpretation). */
export function previewDatetimeLocalIST(localValue: string): string | null {
  try {
    return formatDateTimeIST(datetimeLocalInputToUtcIso(localValue));
  } catch {
    return null;
  }
}
