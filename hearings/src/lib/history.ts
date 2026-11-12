import { CLERKS, MAX_COUNT, MIN_COUNT, type Hearing, defaultTime, newId, clampTime, shuffle, countBy } from "./schedule.ts";
import { weekStart } from "./domain.ts";

export const HISTORY_STORAGE_KEY = "fourth-circuit-history-v2";
export const LEGACY_STORAGE_KEY = "dist4-state-v1";

export type DayRecord = {
  hearings: Hearing[];
  active: string[];
  distributed: boolean;
};
export type HistoryData = { version: 2; selectedDate: string; days: Record<string, DayRecord> };

const knownClerks: readonly string[] = CLERKS;
const separatedClerks = new Set<string>([CLERKS[1], CLERKS[4]]);

function violatesSpacing(sequence: string[], candidate: string): boolean {
  const previous = sequence.at(-1);
  if (previous !== candidate) return false;
  if (separatedClerks.has(candidate)) return true;
  return sequence.at(-2) === candidate;
}

const MAX_GROUP_SIZE = 4;

export function hasAssignmentSpacingConflict(sequence: string[]): boolean {
  return sequence.some((name, index) =>
    !separatedClerks.has(name) && index >= MAX_GROUP_SIZE &&
    sequence.slice(index - MAX_GROUP_SIZE, index).every(previous => previous === name),
  );
}

function arrangeGroupedHearings(quotas: Map<string, number>, rng: () => number): string[] | null {
  const flexible: string[] = [];
  const blocks = new Map<string, number[]>();
  for (const [name, count] of quotas) {
    if (separatedClerks.has(name)) {
      flexible.push(...Array<string>(count).fill(name));
    } else if (count > 0) {
      blocks.set(name, Array.from({ length: Math.ceil(count / MAX_GROUP_SIZE) }, (_, index) =>
        Math.min(MAX_GROUP_SIZE, count - index * MAX_GROUP_SIZE),
      ));
    }
  }

  const separators = shuffle(flexible, rng);
  const order = [...shuffle([...blocks.keys()], rng), null];
  const output: string[] = [];
  let previous: string | null = null;
  let resume: string | null = null;

  const remainingBlocks = (name: string | null) =>
    name === null ? separators.length : blocks.get(name)!.length;

  while ([...blocks.values()].some(group => group.length > 0)) {
    const total = order.reduce((sum, name) => sum + remainingBlocks(name), 0);
    // Leave enough other blocks to separate each clerk's remaining blocks.
    const choices = order.filter(candidate =>
      remainingBlocks(candidate) > 0 && (candidate === null || candidate !== previous) &&
      order.every(name => {
        if (name === null) return true;
        const left = remainingBlocks(name) - Number(name === candidate);
        return left <= total - 1 - left + Number(name !== candidate);
      }),
    );
    if (!choices.length) return null;

    // Prefer a single flexible hearing between blocks of the same clerk.
    const needsSeparator = previous !== null && remainingBlocks(previous) > 0;
    const chosen = choices.includes(resume) && resume !== null ? resume
      : needsSeparator && choices.includes(null) ? null
      : choices[0]!;
    if (chosen === null) {
      output.push(separators.pop()!);
    } else {
      output.push(...Array<string>(blocks.get(chosen)!.shift()!).fill(chosen));
    }
    resume = needsSeparator ? previous : null;
    previous = chosen;
  }
  const prefixCount = Math.floor(rng() * (separators.length + 1));
  return [...separators.slice(0, prefixCount), ...output, ...separators.slice(prefixCount)];
}
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s);

export function blankDay(n = 0): DayRecord {
  return {
    hearings: Array.from({ length: n }, (_, i) => ({ id: newId(), ...defaultTime(i), clerk: null })),
    active: [...CLERKS], distributed: false,
  };
}

/** Sanitize imported/browser storage before using it in UI or fairness calculations. */
export function normalizeDay(raw: unknown): DayRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p["hearings"]) || p["hearings"].length < MIN_COUNT || p["hearings"].length > MAX_COUNT) return null;
  const usedIds = new Set<string>();
  const hearings: Hearing[] = p["hearings"].map((item) => {
    const h = item && typeof item === "object" ? item as Record<string, unknown> : {};
    let id = typeof h["id"] === "string" && h["id"].length < 200 ? h["id"] : newId();
    if (usedIds.has(id)) id = newId();
    usedIds.add(id);
    const hour = Number(h["h"]);
    const minute = Number(h["m"]);
    const normalized = clampTime(Number.isFinite(hour) ? hour : 8, Number.isFinite(minute) ? minute : 0);
    const safeHour = Math.floor(normalized.h);
    const safeMinute = Math.max(0, Math.min(55, Math.floor(normalized.m / 5) * 5));
    const rawEndHour = Number(h["endH"]);
    const rawEndMinute = Number(h["endM"]);
    const endH = Number.isFinite(rawEndHour) ? Math.min(15, Math.max(8, Math.floor(rawEndHour))) : undefined;
    const endM = Number.isFinite(rawEndMinute) ? Math.max(0, Math.min(55, Math.floor(rawEndMinute / 5) * 5)) : undefined;
    return {
      id,
      h: safeHour,
      m: safeHour === 14 ? 0 : safeMinute,
      ...(endH !== undefined && endM !== undefined ? { endH, endM: endH === 15 ? 0 : endM } : {}),
      clerk: typeof h["clerk"] === "string" && knownClerks.includes(h["clerk"]) ? h["clerk"] : null,
      originalClerk: typeof h["originalClerk"] === "string" && knownClerks.includes(h["originalClerk"]) ? h["originalClerk"] : (typeof h["clerk"] === "string" && knownClerks.includes(h["clerk"]) ? h["clerk"] : null),
    };
  });
  const activeInput = Array.isArray(p["active"]) ? p["active"] : null;
  const active = activeInput ? CLERKS.filter((clerk) => activeInput.includes(clerk)) : [...CLERKS];
  return { hearings, active, distributed: p["distributed"] === true };
}

export function dayIsFinal(day: DayRecord) {
  return day.distributed && day.active.length > 0 && day.hearings.length > 0 && day.hearings.every((h) => h.clerk !== null && day.active.includes(h.clerk));
}

export function newHistory(today: string): HistoryData {
  return { version: 2, selectedDate: today, days: { [today]: blankDay() } };
}

export function restoreHistory(stored: string | null, legacy: string | null, today: string): HistoryData {
  if (stored) {
    try {
      const p: unknown = JSON.parse(stored);
      if (p && typeof p === "object" && (p as HistoryData).version === 2 && (p as HistoryData).days && typeof (p as HistoryData).days === "object") {
        const original = p as HistoryData;
        const days: Record<string, DayRecord> = {};
        for (const [date, raw] of Object.entries(original.days)) {
          if (isDate(date)) {
            const day = normalizeDay(raw);
            if (day) days[date] = day;
          }
        }
        const selectedDate = isDate(original.selectedDate) ? original.selectedDate : today;
        if (!days[selectedDate]) days[selectedDate] = blankDay();
        return { version: 2, selectedDate, days };
      }
    } catch { /* continue to legacy data */ }
  }
  if (legacy) {
    try {
      const p = JSON.parse(legacy) as { date?: string; hearings?: Hearing[]; active?: string[]; distributed?: boolean };
      const date = p.date && isDate(p.date) ? p.date : today;
      const day = normalizeDay(p);
      if (day) return { version: 2, selectedDate: date, days: { [date]: day } };
    } catch { /* ignore invalid old data */ }
  }
  return newHistory(today);
}

/** Per-employee ledger = assigned hearings minus their expected share on ATTENDED days.
 *  Excludes the current day and all later dates, and only counts fully assigned days. */
export function historicalDebt(days: Record<string, DayRecord>, beforeDate: string): Record<string, number> {
  const debts: Record<string, number> = {};
  CLERKS.forEach((clerk) => { debts[clerk] = 0; });
  const targetWeek = weekStart(beforeDate);
  for (const [date, day] of Object.entries(days)) {
    if (date >= beforeDate || weekStart(date) !== targetWeek || !dayIsFinal(day)) continue;
    const expected = day.hearings.length / day.active.length;
    for (const clerk of day.active) debts[clerk] = (debts[clerk] ?? 0) - expected;
    for (const hearing of day.hearings) {
      const clerk = hearing.clerk!;
      debts[clerk] = (debts[clerk] ?? 0) + 1;
    }
  }
  return debts;
}

/** Base even split per day; historical least-served employees get first dibs on extras. */
export function distributeFairly(
  n: number, active: string[], days: Record<string, DayRecord>, date: string,
  rng: () => number = Math.random,
): string[] {
  if (n <= 0 || active.length === 0) return [];
  const unique = [...new Set(active)];
  const debts = historicalDebt(days, date);
  // Shuffle before stable sorting for random tie-breaks, including on repeated draws.
  const preference = shuffle(unique, rng).sort((a, b) => (debts[a] ?? 0) - (debts[b] ?? 0));
  const base = Math.floor(n / unique.length);
  const surplus = n % unique.length;
  const remaining = new Map<string, number>();
  for (let i = 0; i < preference.length; i++) {
    remaining.set(preference[i]!, base + (i < surplus ? 1 : 0));
  }
  const arranged = arrangeGroupedHearings(remaining, rng);
  if (arranged) return arranged;

  // A strict layout can be impossible when too few employees are present.
  const fallback: string[] = [];
  for (const name of preference) {
    for (let i = 0; i < (remaining.get(name) ?? 0); i++) fallback.push(name);
  }
  return fallback;
}

/** Assign only newly added hearings without changing the existing distribution. */
export function assignAdditionalFairly(
  existing: Hearing[], count: number, active: string[], days: Record<string, DayRecord>, date: string,
  rng: () => number = Math.random,
): string[] {
  if (count <= 0 || active.length === 0) return [];
  const unique = [...new Set(active)];
  const previousDebt = historicalDebt(days, date);
  const todayCounts = countBy(existing, unique);
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const sequence = [...existing.map(item => item.clerk).filter((name): name is string => Boolean(name)), ...result];
    const valid = unique.filter(name => !violatesSpacing(sequence, name));
    const candidates = shuffle(valid.length ? valid : unique, rng).sort((a, b) => {
      const loadDifference = (previousDebt[a] ?? 0) + (todayCounts[a] ?? 0) -
        ((previousDebt[b] ?? 0) + (todayCounts[b] ?? 0));
      if (loadDifference) return loadDifference;
      const previous = sequence.at(-1);
      const aPair = !separatedClerks.has(a) && a === previous ? 1 : 0;
      const bPair = !separatedClerks.has(b) && b === previous ? 1 : 0;
      return bPair - aPair;
    });
    const chosen = candidates[0]!;
    result.push(chosen);
    todayCounts[chosen] = (todayCounts[chosen] ?? 0) + 1;
  }
  return result;
}

export function historicalDays(days: Record<string, DayRecord>): number {
  return Object.values(days).filter(dayIsFinal).length;
}
