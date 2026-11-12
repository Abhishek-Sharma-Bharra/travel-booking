import { z } from "zod";
export function validTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
export const timezoneSchema = z
  .string()
  .max(100)
  .refine(validTimezone, "Use a valid IANA timezone, such as Asia/Kolkata");
export function calendarDate(date: Date, zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function shiftDay(day: string, days: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Earliest instant whose local calendar date is >= day. Handles 23/25-hour days
// and midnight transitions without pretending each local day is 24 UTC hours.
export function startOfLocalDay(day: string, zone: string) {
  if (
    !validTimezone(zone) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    isNaN(+new Date(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    throw new Error("Invalid reporting date/timezone");
  const center = +new Date(day + "T00:00:00Z");
  let lo = center - 48 * 3600000,
    hi = center + 48 * 3600000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (calendarDate(new Date(mid), zone) < day) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo);
}
export function reportingWindow(from: string, to: string, zone: string) {
  const days = Math.round((+new Date(to) - +new Date(from)) / 86400000) + 1;
  if (!Number.isInteger(days) || days < 1 || days > 366)
    throw new Error("Select a range of 1–366 calendar days");
  return {
    from,
    to,
    days,
    start: startOfLocalDay(from, zone),
    end: startOfLocalDay(shiftDay(to, 1), zone),
  };
}
export function fullCalendarMonths(from: string, to: string) {
  return from.endsWith("-01") && shiftDay(to, 1).endsWith("-01");
}
