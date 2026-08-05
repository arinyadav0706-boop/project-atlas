// Human duration <-> minutes. Pure + unit-tested (ADR-0030 stores minutes;
// formatting is presentation only).

// Parse "1h 30m", "90m", "1.5h", "2h", or a bare "90" (minutes) into whole
// minutes. Returns null when nothing usable is found (caller shows a hint).
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  // Bare number => minutes.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Math.round(Number(s));
    return n > 0 ? n : null;
  }

  // Hours and/or minutes tokens, e.g. "1h", "1.5h", "30m", "1h30m", "1h 30m".
  const match = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const mins = match[2] ? Number(match[2]) : 0;
  const total = Math.round(hours * 60 + mins);
  return total > 0 ? total : null;
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
