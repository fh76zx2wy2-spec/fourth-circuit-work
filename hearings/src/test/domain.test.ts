import { describe, expect, it } from "vitest";
import { CLERKS } from "../lib/schedule";
import { assignAdditionalFairly, blankDay, distributeFairly, hasAssignmentSpacingConflict, normalizeDay, type DayRecord } from "../lib/history";
import { compensationExpires, distributeForWeek, hasTimeConflict, isSaudiWorkday, sameWorkWeek, summarizeWeek, weekStart, type Assignment, type Apology } from "../lib/domain";

const [musa, khalid, mohammed, mater, yahya] = CLERKS;
const hearing = (id: string, date: string, actual: string, original = actual, h = 8): Assignment => ({ id, date, h, m: 0, actual, original, status: "scheduled" });

describe("Saudi work week", () => {
  it("starts a new day with no hearings until the supervisor adds them", () => {
    expect(blankDay().hearings).toEqual([]);
    expect(normalizeDay(blankDay())?.hearings).toEqual([]);
  });

  it("accepts Sunday through Thursday and rejects Friday and Saturday", () => {
    expect(isSaudiWorkday("2026-10-18")).toBe(true);
    expect(isSaudiWorkday("2026-10-22")).toBe(true);
    expect(isSaudiWorkday("2026-10-23")).toBe(false);
    expect(isSaudiWorkday("2026-10-24")).toBe(false);
  });

  it("starts Sunday and closes Thursday without carrying to next Sunday", () => {
    expect(weekStart("2026-10-18")).toBe("2026-10-18");
    expect(weekStart("2026-10-22")).toBe("2026-10-18");
    expect(compensationExpires("2026-10-21")).toBe("2026-10-22");
    expect(sameWorkWeek("2026-10-22", "2026-10-25")).toBe(false);
  });
});

describe("fairness and apologies", () => {
  it("assigns a forgotten hearing fairly without changing existing assignments", () => {
    const existing = [
      { id: "1", h: 8, m: 0, clerk: musa },
      { id: "2", h: 8, m: 30, clerk: musa },
      { id: "3", h: 9, m: 0, clerk: khalid },
      { id: "4", h: 9, m: 30, clerk: mohammed },
      { id: "5", h: 10, m: 0, clerk: mater },
      { id: "6", h: 10, m: 30, clerk: yahya },
    ];
    const day: DayRecord = { hearings: existing, active: [...CLERKS], distributed: true };
    const added = assignAdditionalFairly(existing, 1, [...CLERKS], { "2026-10-25": day }, "2026-10-25", () => 0.5);
    expect(added).toHaveLength(1);
    expect(added[0]).not.toBe(musa);
    expect(existing.map((item) => item.clerk)).toEqual([musa, musa, khalid, mohammed, mater, yahya]);
  });

  it("gives future work to the least served employees", () => {
    const previous = [hearing("1", "2026-10-18", musa), hearing("2", "2026-10-18", musa), hearing("3", "2026-10-18", khalid)];
    const draw = distributeForWeek(5, [...CLERKS], previous, [], () => 0.5);
    const counts = Object.fromEntries(CLERKS.map(c => [c, draw.filter(x => x === c).length]));
    expect(counts[musa]).toBeLessThanOrEqual(counts[mohammed]!);
    expect(counts[khalid]).toBeLessThanOrEqual(counts[mater]!);
  });

  it("keeps Khalid and Yahya separated and limits other blocks to two", () => {
    const draw = distributeFairly(12, [...CLERKS], {}, "2026-10-25", () => 0.5);
    expect(hasAssignmentSpacingConflict(draw)).toBe(false);
    expect(draw.some((name, index) => index > 0 && name === draw[index - 1] && !(name === khalid || name === yahya))).toBe(true);
    for (let i = 1; i < draw.length; i++) {
      if ((draw[i] === khalid || draw[i] === yahya)) expect(draw[i]).not.toBe(draw[i - 1]);
      if (i > 1) expect([draw[i - 2], draw[i - 1], draw[i]]).not.toEqual([draw[i], draw[i], draw[i]]);
    }
  });

  it("keeps the strict spacing rules with more than fifteen hearings", () => {
    const draw = distributeFairly(20, [...CLERKS], {}, "2026-10-25", () => 0.5);
    expect(hasAssignmentSpacingConflict(draw)).toBe(false);
  });

  it("keeps the spacing preferences for every supported daily count", () => {
    for (let count = 1; count <= 60; count++) {
      const draw = distributeFairly(count, [...CLERKS], {}, "2026-10-25", () => 0.5);
      expect(draw).toHaveLength(count);
      expect(hasAssignmentSpacingConflict(draw)).toBe(false);
    }
  });

  it("reports when strict separation is mathematically impossible", () => {
    const draw = distributeFairly(3, [khalid], {}, "2026-10-25", () => 0.5);
    expect(hasAssignmentSpacingConflict(draw)).toBe(true);
  });

  it("counts a partial apology once and keeps the employee present", () => {
    const rows = [hearing("a", "2026-10-19", khalid, musa)];
    const apologies: Apology[] = [{ id: "x", hearingId: "a", original: musa, replacement: khalid, active: true }];
    const summary = summarizeWeek(rows, apologies);
    expect(summary[khalid]).toMatchObject({ actual: 1, covered: 1, pending: -1 });
    expect(summary[musa]).toMatchObject({ actual: 0, covered: 0, pending: 1 });
  });

  it("ignores cancelled sessions and inactive apologies", () => {
    const row = hearing("a", "2026-10-19", khalid, musa); row.status = "cancelled";
    const summary = summarizeWeek([row], [{ id: "x", hearingId: "a", original: musa, replacement: khalid, active: false }]);
    expect(summary[khalid]?.actual).toBe(0);
    expect(summary[musa]?.pending).toBe(0);
  });

  it("detects simultaneous assignments", () => {
    const rows = [hearing("a", "2026-10-19", musa, musa, 10), hearing("b", "2026-10-19", khalid, khalid, 10)];
    expect(hasTimeConflict(rows, "b", musa)).toBe(true);
    expect(hasTimeConflict(rows, "b", yahya)).toBe(false);
  });
});
