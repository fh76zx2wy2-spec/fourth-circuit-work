import { CLERKS, MAX_COUNT, MIN_COUNT, type Hearing, defaultTime, newId, clampTime, shuffle, countBy } from "./schedule.ts";
import { weekStart } from "./domain.ts";

export const HISTORY_STORAGE_KEY = "fourth-circuit-history-v2";
export const LEGACY_STORAGE_KEY = "dist4-state-v1";

/** ظرف الموظف ليوم واحد: ثلث اليوم الذي لا تُسند إليه فيه جلسات (0 أول اليوم، 1 وسطه، 2 آخره). */
export type DayLimits = Record<string, 0 | 1 | 2>;
export type DayRecord = {
  hearings: Hearing[];
  active: string[];
  distributed: boolean;
  limits?: DayLimits;
  /** تعذّر مراعاة الظروف كلها في آخر قرعة فوُزّعت دونها. */
  limitsRelaxed?: boolean;
};
export type HistoryData = { version: 2; selectedDate: string; days: Record<string, DayRecord> };

const knownClerks: readonly string[] = CLERKS;
const separatedClerks = new Set<string>([CLERKS[1], CLERKS[4]]);
// ترتيب إسناد جلسات القضايا ذات الجلسات السابقة (الأول أولى).
const continuityOrder: readonly string[] = [CLERKS[0], CLERKS[2], CLERKS[1]];
const limitedSet: readonly string[] = [CLERKS[3], CLERKS[4]];

function violatesSpacing(sequence: (string | null)[], candidate: string): boolean {
  const previous = sequence.at(-1);
  if (previous !== candidate) return false;
  if (separatedClerks.has(candidate)) return true;
  const tail = sequence.slice(-MAX_GROUP_SIZE);
  return tail.length === MAX_GROUP_SIZE && tail.every(name => name === candidate);
}

const MAX_GROUP_SIZE = 4;

export function hasAssignmentSpacingConflict(sequence: string[]): boolean {
  return sequence.some((name, index) =>
    !separatedClerks.has(name) && index >= MAX_GROUP_SIZE &&
    sequence.slice(index - MAX_GROUP_SIZE, index).every(previous => previous === name),
  );
}

type Arrangement = {
  order: number[];
  remaining: number[];
  last: number[];
  run: number;
  cost: number;
};

function separationCost(gap: number): number {
  if (gap === 0) return 1500;
  // جلسة واحدة بين كل جلستين هي الأنسب؛ تكبر الكلفة مع اتساع الفاصل.
  if (gap === 1) return 0;
  if (gap === 2) return 10;
  if (gap === 3) return 40;
  return 80 + 40 * (gap - 4) ** 2;
}

function arrangeHearings(quotas: Map<string, number>, rng: () => number, limits?: DayLimits, followups?: number[], soft = false): string[] | null {
  const names = shuffle([...quotas.keys()].filter(name => quotas.get(name)! > 0), rng);
  const initial = names.map(name => quotas.get(name)!);
  if (names.length <= 1 && !limits && !followups) return Array<string>(initial[0] ?? 0).fill(names[0] ?? "");
  const separated = names.map(name => separatedClerks.has(name));
  const total = initial.reduce((sum, count) => sum + count, 0);
  // الجلسات مرتبة زمنيًا؛ الموضع يحدد ثلث اليوم.
  const third = (position: number) => Math.min(2, Math.floor(position * 3 / total));
  const blocked = names.map(name => limits?.[name] ?? -1);
  // وزن الجلسة = عدد جلسات قضيتها (0 للجلسة الأولى).
  const weight = (p: number) => followups?.[p] ?? 0;
  const isFollowup = (p: number) => weight(p) > 0;
  const continuity = names.map(name => continuityOrder.indexOf(name));
  const outsider = names.map(name => limitedSet.includes(name));
  const hardOutsider = Boolean(followups) && !soft;
  // followupsAfter[p]: عدد جلسات المتابعة من الموضع p فما بعد.
  const followupsAfter = Array<number>(total + 1).fill(0);
  for (let p = total - 1; p >= 0; p--) followupsAfter[p] = followupsAfter[p + 1]! + (isFollowup(p) ? 1 : 0);
  // allowedAfter[b][p]: عدد المواضع من p فما بعد خارج الثلث b.
  const allowedAfter = [0, 1, 2].map(b => {
    const counts = Array<number>(total + 1).fill(0);
    for (let p = total - 1; p >= 0; p--) counts[p] = counts[p + 1]! + (third(p) !== b ? 1 : 0);
    return counts;
  });
  // Keep several promising partial layouts so choosing one clerk never commits the whole draw.
  const beamWidth = 48;
  let layouts: Arrangement[] = [{ order: [], remaining: initial, last: names.map(() => -1), run: 0, cost: 0 }];

  for (let position = 0; position < total; position++) {
    const next = new Map<string, { layout: Arrangement; rank: number }>();
    for (const layout of layouts) {
      const previous = layout.order.at(-1);
      for (let i = 0; i < names.length; i++) {
        if (!layout.remaining[i]) continue;
        if (blocked[i] === third(position)) continue;
        if (hardOutsider && outsider[i] && isFollowup(position)) continue;
        const run = previous === i ? layout.run + 1 : 1;
        if (!separated[i] && run > MAX_GROUP_SIZE) continue;
        const remaining = [...layout.remaining];
        remaining[i] = remaining[i]! - 1;
        if (remaining.some((count, j) => blocked[j]! >= 0 && count > allowedAfter[blocked[j]!]![position + 1]!)) continue;
        if (hardOutsider) {
          const insiders = remaining.reduce((sum, count, j) => sum + (outsider[j] ? 0 : count), 0);
          const plain = total - position - 1 - followupsAfter[position + 1]!;
          if (followupsAfter[position + 1]! > insiders || remaining.some((count, j) => outsider[j] && count > plain)) continue;
        }
        // Preserve enough slots to break any remaining runs of grouped clerks.
        const unplaced = total - position - 1;
        if (remaining.some((count, j) => !separated[j] &&
          count > MAX_GROUP_SIZE * (unplaced - count + 1) - (j === i ? run : 0))) continue;

        const last = [...layout.last];
        const gap = position - last[i]! - 1;
        let cost = layout.cost;
        if (last[i] !== -1) {
          if (separated[i]) {
            cost += separationCost(gap);
          } else if (gap > 0) {
            const breakCost = initial[i]! <= MAX_GROUP_SIZE ? 28 : 9;
            cost += breakCost + 2 * gap ** 2 + 18 * Math.max(0, gap - 4) ** 2;
          }
        }
        // الجلسات اللاحقة: تُتجنَّب لهما (والأخف إن لزم)، وتتوزع بالتساوي بين الثلاثة.
        if (isFollowup(position)) {
          if (outsider[i]) cost += 150 + 20 * weight(position);
          else {
            let taken = 0, load = 0;
            layout.order.forEach((who, p) => { if (who === i && isFollowup(p)) { taken++; load += weight(p); } });
            cost += 25 * taken + 4 * load;
          }
        }
        last[i] = position;
        // Price open gaps as they grow so a good partial layout doesn't strand a clerk at the end.
        const pending = remaining.reduce((sum, count, j) => {
          if (!count || last[j] === -1) return sum;
          const wait = position - last[j]!;
          return sum + (separated[j] ? Math.max(0, wait - 2) ** 2 * 30 : wait ** 2 * 8);
        }, 0);
        const rank = cost + pending;
        const key = `${remaining.join(",")}|${last.join(",")}|${run}`;
        const existing = next.get(key);
        if (!existing || rank < existing.rank) {
          next.set(key, { layout: { order: [...layout.order, i], remaining, last, run, cost }, rank });
        }
      }
    }
    layouts = [...next.values()].sort((a, b) => a.rank - b.rank).slice(0, beamWidth).map(entry => entry.layout);
    if (!layouts.length) return null;
  }
  return layouts[0]!.order.map(index => names[index]!);
}
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s);

/** Unsaved day: start with the organizer's session times for that date (set by the host page). */
export function organizerDay(date: string): DayRecord {
  try {
    const slots = (globalThis as { __organizerHearings?: (d: string) => Array<{ h: number; m: number; endH?: number; endM?: number }> }).__organizerHearings?.(date) ?? [];
    if (!slots.length) return blankDay();
    const list = slots.slice(0, 60), last = list[list.length - 1];
    // Only the final hearing keeps an explicit end (Taqadi's); earlier ones end at the next start.
    return { hearings: list.map((x) => ({ id: newId(), h: x.h, m: x.m, ...(x === last && x.endH !== undefined && x.endM !== undefined ? { endH: x.endH, endM: x.endM } : {}), clerk: null })), active: [...CLERKS], distributed: false };
  } catch {
    return blankDay();
  }
}

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
  rng: () => number = Math.random, limits?: DayLimits, followups?: number[], soft = false,
): string[] | null {
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
  return arrangeHearings(remaining, rng, limits, followups, soft);
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
  const priorAssignments = existing.map(item => item.clerk);
  for (let i = 0; i < count; i++) {
    const sequence = [...priorAssignments, ...result];
    const valid = unique.filter(name => !violatesSpacing(sequence, name));
    const candidates = shuffle(valid.length ? valid : unique, rng).sort((a, b) => {
      const loadDifference = (previousDebt[a] ?? 0) + (todayCounts[a] ?? 0) -
        ((previousDebt[b] ?? 0) + (todayCounts[b] ?? 0));
      if (loadDifference) return loadDifference;
      const placementCost = (name: string) => {
        const last = sequence.lastIndexOf(name);
        if (last === -1) return 0;
        const gap = sequence.length - last - 1;
        return separatedClerks.has(name) ? separationCost(gap) : gap ** 2;
      };
      return placementCost(a) - placementCost(b);
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
