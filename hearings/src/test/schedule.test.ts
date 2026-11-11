import { describe, it, expect } from "vitest";
import { CLERKS, distribute, defaultTime, formatTime12, formatTimeRange, formatDates } from "@/lib/schedule";

describe("schedule rules", () => {
  it("10 hearings over 5 clerks gives exactly 2 each", () => {
    const r = distribute(10, [...CLERKS]);
    CLERKS.forEach((c) => expect(r.filter((x) => x === c).length).toBe(2));
  });
  it("counts differ by at most 1 among active clerks", () => {
    const active = CLERKS.slice(0, 3);
    const r = distribute(11, active);
    const counts = active.map((c) => r.filter((x) => x === c).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(r.length).toBe(11);
  });
  it("default times never exceed 14:00", () => {
    expect(defaultTime(9)).toEqual({ h: 12, m: 30 });
    expect(defaultTime(59)).toEqual({ h: 14, m: 0 });
  });
  it("formats 13:00 as 1:00 م", () => {
    expect(formatTime12(13, 0)).toBe("1:00 م");
    expect(formatTime12(8, 30)).toBe("8:30 ص");
  });
  it("derives each hearing end from the next hearing start", () => {
    const hearings = [
      { id: "a", h: 8, m: 0, clerk: null },
      { id: "b", h: 8, m: 30, clerk: null },
    ];
    expect(formatTimeRange(hearings[0]!, hearings)).toBe("8:00 ص – 8:30 ص");
    expect(formatTimeRange(hearings[1]!, hearings)).toBe("8:30 ص – 9:00 ص");
  });
  it("uses the selected end time for the final hearing", () => {
    const hearings = [{ id: "a", h: 13, m: 0, endH: 14, endM: 15, clerk: null }];
    expect(formatTimeRange(hearings[0]!, hearings)).toBe("1:00 م – 2:15 م");
  });
  it("weekday matches date", () => {
    expect(formatDates("2026-10-25").weekday).toBe("الأحد");
  });
});
