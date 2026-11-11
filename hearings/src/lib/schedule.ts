export const CLERKS = [
  "موسى احمد قاري بصلي",
  "خالد فيصل محمد حكمي",
  "محمد جرادي بداحي عياشي",
  "ماطر يحيى محمد ابوالراس",
  "يحيى علي محمد شعيبي",
] as const;

export const HOURS = [8, 9, 10, 11, 12, 13, 14];
export const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
export const END_TIMES = Array.from({ length: 85 }, (_, i) => 8 * 60 + i * 5)
  .filter((minutes) => minutes <= 15 * 60)
  .map((minutes) => ({ h: Math.floor(minutes / 60), m: minutes % 60 }));
export const MIN_COUNT = 0;
export const MAX_COUNT = 60;

export type Hearing = { id: string; h: number; m: number; endH?: number; endM?: number; clerk: string | null; originalClerk?: string | null };

let idc = 0;
export const newId = () => typeof crypto !== "undefined" && crypto.randomUUID
  ? crypto.randomUUID()
  : `00000000-0000-4000-8000-${(Date.now() + idc++).toString().padStart(12, "0").slice(-12)}`;

/** Ascending half-hour time for the i-th row, never past 14:00. */
export function defaultTime(i: number): { h: number; m: number } {
  const mins = Math.min(8 * 60 + i * 30, 14 * 60);
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

export function clampTime(h: number, m: number) {
  const hh = Math.min(14, Math.max(8, h));
  return { h: hh, m: hh === 14 ? 0 : m };
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i] as T; a[i] = a[j] as T; a[j] = t;
  }
  return a;
}

/** Returns a clerk per hearing; counts differ by at most 1. */
export function distribute(n: number, active: string[], rng: () => number = Math.random): string[] {
  if (!active.length || n <= 0) return [];
  const order = shuffle(active, rng);
  const base = Math.floor(n / order.length);
  const extra = n % order.length;
  const pool: string[] = [];
  order.forEach((c, i) => {
    for (let k = 0; k < base + (i < extra ? 1 : 0); k++) pool.push(c);
  });
  return shuffle(pool, rng);
}

export function countBy(hearings: Hearing[], clerks: string[]) {
  const map: Record<string, number> = {};
  clerks.forEach((c) => (map[c] = 0));
  hearings.forEach((h) => {
    if (h.clerk && h.clerk in map) map[h.clerk] = (map[h.clerk] ?? 0) + 1;
  });
  return map;
}

export const pad = (n: number) => String(n).padStart(2, "0");

export function periodLabel(h: number) {
  return h < 12 ? "صباحًا" : h === 12 ? "ظهرًا" : "مساءً";
}

export function formatTime12(h: number, m: number) {
  const hh = h > 12 ? h - 12 : h;
  return `${hh}:${pad(m)} ${h < 12 ? "ص" : "م"}`;
}

export function defaultEndTime(hearing: Pick<Hearing, "h" | "m">) {
  const minutes = Math.min(hearing.h * 60 + hearing.m + 30, 15 * 60);
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}

export function resolvedEndTime(hearing: Hearing) {
  const start = hearing.h * 60 + hearing.m;
  const stored = hearing.endH !== undefined && hearing.endM !== undefined
    ? hearing.endH * 60 + hearing.endM
    : 0;
  return stored > start && stored <= 15 * 60
    ? { h: hearing.endH!, m: hearing.endM! }
    : defaultEndTime(hearing);
}

export function nextHearingStart(hearing: Hearing, hearings: Hearing[]) {
  const start = hearing.h * 60 + hearing.m;
  return hearings
    .filter((candidate) => candidate.h * 60 + candidate.m > start)
    .sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m))[0];
}

/** End time is derived from the next chronological hearing; the final hearing keeps its start only. */
export function formatTimeRange(hearing: Hearing, hearings: Hearing[]) {
  const next = nextHearingStart(hearing, hearings);
  const end = next ?? resolvedEndTime(hearing);
  return `${formatTime12(hearing.h, hearing.m)} – ${formatTime12(end.h, end.m)}`;
}

export function sortChrono(hearings: Hearing[]) {
  return hearings
    .map((h, i) => ({ h, i }))
    .sort((a, b) => a.h.h * 60 + a.h.m - (b.h.h * 60 + b.h.m) || a.i - b.i)
    .map((x) => x.h);
}

export function todayRiyadh() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
}

function noonDate(iso: string) {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC((y ?? 2026), (mo || 1) - 1, d || 1, 12));
}

export function formatDates(iso: string) {
  const d = noonDate(iso);
  const tz = "Asia/Riyadh";
  const weekday = new Intl.DateTimeFormat("ar-SA", { weekday: "long", timeZone: tz }).format(d);
  const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    day: "numeric", month: "long", year: "numeric", timeZone: tz, numberingSystem: "latn",
  }).format(d).replace(/\s*هـ\s*$/, "");
  const greg = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    day: "numeric", month: "long", year: "numeric", timeZone: tz, numberingSystem: "latn",
  }).format(d).replace(/\s*م\s*$/, "");
  return { weekday, hijri: `${hijri} هـ`, greg: `${greg} م` };
}
