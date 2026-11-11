import { CLERKS, shuffle } from "./schedule.ts";

export type HearingStatus = "scheduled" | "cancelled" | "not_held";
export type Assignment = {
  id: string;
  date: string;
  h: number;
  m: number;
  original: string | null;
  actual: string | null;
  status: HearingStatus;
};
export type Apology = {
  id: string;
  hearingId: string;
  original: string;
  replacement: string;
  reason?: string;
  active: boolean;
};
export type WeekSummary = Record<string, { actual: number; covered: number; pending: number }>;

const isoDate = (value: string) => new Date(`${value}T12:00:00Z`);

/** Court workdays in Saudi Arabia are Sunday through Thursday. */
export function isSaudiWorkday(date: string): boolean {
  const day = isoDate(date).getUTCDay();
  return day >= 0 && day <= 4;
}

/** Saudi work week key: Sunday in Asia/Riyadh's calendar date. */
export function weekStart(date: string): string {
  const d = isoDate(date);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export function sameWorkWeek(a: string, b: string) {
  return weekStart(a) === weekStart(b);
}

export function summarizeWeek(hearings: Assignment[], apologies: Apology[]): WeekSummary {
  const result: WeekSummary = Object.fromEntries(CLERKS.map(name => [name, { actual: 0, covered: 0, pending: 0 }]));
  const activeApologies = new Map(apologies.filter(a => a.active).map(a => [a.hearingId, a]));
  for (const hearing of hearings) {
    if (hearing.status !== "scheduled" || !hearing.actual) continue;
    result[hearing.actual]!.actual += 1;
    const apology = activeApologies.get(hearing.id);
    if (apology && apology.replacement === hearing.actual && apology.original !== apology.replacement) {
      result[apology.replacement]!.covered += 1;
      result[apology.original]!.pending += 1;
      result[apology.replacement]!.pending -= 1;
    }
  }
  return result;
}

/** Assign evenly, preferring the lowest effective weekly load; ties are random. */
export function distributeForWeek(
  count: number,
  active: string[],
  previous: Assignment[],
  apologies: Apology[],
  rng: () => number = Math.random,
): string[] {
  const unique = [...new Set(active)].filter(name => CLERKS.includes(name as (typeof CLERKS)[number]));
  if (!unique.length || count < 1) return [];
  const summary = summarizeWeek(previous, apologies);
  const assigned: Record<string, number> = Object.fromEntries(unique.map(name => [name, 0]));
  const output: string[] = [];
  for (let i = 0; i < count; i++) {
    const randomized = shuffle(unique, rng);
    randomized.sort((a, b) => {
      const aa = summary[a]!.actual + assigned[a]!;
      const bb = summary[b]!.actual + assigned[b]!;
      return aa - bb || summary[b]!.pending - summary[a]!.pending;
    });
    const chosen = randomized[0]!;
    assigned[chosen]! += 1;
    output.push(chosen);
  }
  return shuffle(output, rng);
}

export function hasTimeConflict(hearings: Assignment[], hearingId: string, replacement: string) {
  const target = hearings.find(h => h.id === hearingId);
  if (!target) return false;
  return hearings.some(h => h.id !== hearingId && h.status === "scheduled" && h.actual === replacement && h.h === target.h && h.m === target.m);
}

export function compensationExpires(date: string) {
  const d = isoDate(weekStart(date));
  d.setUTCDate(d.getUTCDate() + 4);
  return d.toISOString().slice(0, 10);
}
