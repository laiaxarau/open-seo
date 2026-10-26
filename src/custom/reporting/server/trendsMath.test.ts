import { describe, expect, it } from "vitest";
import { summariseTrend } from "@/custom/reporting/server/trendsMath";

const point = (date: string, values: (number | null)[], missing = false) => ({
  date_from: date,
  values,
  missing_data: missing,
});

describe("summariseTrend", () => {
  it("compares the average interest of the period with the one before", () => {
    const [line] = summariseTrend(
      {
        keywords: ["fresas dentales"],
        data: [
          point("2026-08-04", [80]),
          point("2026-08-18", [60]),
          point("2026-09-01", [40]),
          point("2026-09-15", [30]),
        ],
      },
      "2026-09-01",
      "2026-08-04",
    );
    expect(line.before).toBe(70);
    expect(line.now).toBe(35);
    expect(line.change).toBeCloseTo(-0.5);
  });

  it("gives no change when there is no earlier period or it is empty", () => {
    const [line] = summariseTrend(
      { keywords: ["x"], data: [point("2026-09-01", [50])] },
      "2026-09-01",
      null,
    );
    expect(line.change).toBeNull();
    expect(line.before).toBeNull();
  });

  it("ignores the points Google marks as missing", () => {
    const lines = summariseTrend(
      { keywords: ["x"], data: [point("2026-09-01", [0], true)] },
      "2026-09-01",
      null,
    );
    expect(lines).toEqual([]);
  });
});
