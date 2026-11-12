// Human duration <-> minutes. Pure + unit-tested (ADR-0030 stores minutes;
// formatting is presentation only).

const MAX_MINUTES = 1440;

// Parse a typed duration into whole minutes (37_timesheets BR-5, ADR-0059 Q10).
// A bare number means HOURS — "1.5" is 1h 30m and "8" is 8h — because in a
// timesheet cell that is what people type; minutes need an explicit "m".
// Accepts "1:30", "1.5", "1h 30m", "1h30m", "1.5h", "90m". Returns null for
// anything unreadable, negative, or above 24h. "0" parses to 0 so a caller
// can treat it as "clear this cell".
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  let total: number | null = null;

  const clock = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (clock) {
    total = Number(clock[1]) * 60 + Number(clock[2]);
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    total = Math.round(Number(s) * 60);
  } else {
    const match = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/);
    if (!match || (match[1] === undefined && match[2] === undefined)) return null;
    const hours = match[1] ? Number(match[1]) : 0;
    const mins = match[2] ? Number(match[2]) : 0;
    total = Math.round(hours * 60 + mins);
  }

  if (!Number.isFinite(total) || total < 0 || total > MAX_MINUTES) return null;
  return total;
}

// Split total minutes into { hours, minutes } for the H/M input fields.
export function splitMinutes(total: number): { hours: number; minutes: number } {
  const abs = Math.abs(Math.round(total));
  return { hours: Math.floor(abs / 60), minutes: abs % 60 };
}

// Format minutes as "1h 30m" (omitting zero parts). 0 -> "0m".
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0 && m === 0) return "0m";
  return sign + [h > 0 ? `${h}h` : "", m > 0 ? `${m}m` : ""].filter(Boolean).join(" ");
}
