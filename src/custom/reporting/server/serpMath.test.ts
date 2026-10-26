import { describe, expect, it } from "vitest";
import { pickLosingQueries } from "@/custom/reporting/server/searchSelection";
import { ownDomainOf, summariseSerp } from "@/custom/reporting/server/serpMath";
import type { ReportFull } from "@/custom/reporting/types";

describe("summariseSerp", () => {
  const items = [
    { type: "paid", rank_group: 1, rank_absolute: 1, domain: "ads.com" },
    { type: "ai_overview", rank_group: 1, rank_absolute: 2 },
    { type: "organic", rank_group: 1, rank_absolute: 3, domain: "rival.com" },
    { type: "video", rank_group: 1, rank_absolute: 4 },
    {
      type: "organic",
      rank_group: 2,
      rank_absolute: 5,
      domain: "www.mysite.com",
    },
    { type: "people_also_ask", rank_group: 1, rank_absolute: 6 },
    { type: "organic", rank_group: 3, rank_absolute: 7, domain: "later.com" },
  ];

  it("tells which blocks sit above the site's result and who is ahead", () => {
    const line = summariseSerp("x", items, "mysite.com");
    expect(line.ownPosition).toBe(2);
    expect(line.ahead).toEqual(["rival.com"]);
    const above = Object.fromEntries(
      line.features.map((item) => [item.type, item.above]),
    );
    expect(above).toEqual({
      paid: true,
      ai_overview: true,
      video: true,
      people_also_ask: false,
    });
  });

  it("treats every block as above when the site is not on the first page", () => {
    const line = summariseSerp("x", items, "other.com");
    expect(line.ownPosition).toBeNull();
    expect(line.features.every((item) => item.above)).toBe(true);
  });

  it("reads the domain of a Search Console property", () => {
    expect(ownDomainOf("sc-domain:www.Example.com")).toBe("example.com");
    expect(ownDomainOf("https://www.example.com/es")).toBe("example.com");
  });
});

describe("pickLosingQueries", () => {
  const report = (net: number) =>
    ({
      snapshot: {
        prevTotals: { clicks: 1000 },
        totals: { clicks: 1000 - net },
        queryRows: [{ query: "marca", brand: true }],
        queryLosers: [
          { key: "marca", clicksDelta: -300 },
          { key: "a", clicksDelta: -100 },
          { key: "b", clicksDelta: -80 },
          { key: "c", clicksDelta: -60 },
          { key: "d", clicksDelta: -40 },
          { key: "e", clicksDelta: -30 },
          { key: "f", clicksDelta: -20 },
        ],
        pageLosers: [],
      },
    }) as unknown as ReportFull;

  it("leaves brand searches out and stops once enough of the fall is explained", () => {
    const small = pickLosingQueries(report(200), 15);
    expect(small.picks.map((item) => item.query)).toEqual(["a", "b", "c", "d"]);
    expect(small.share).toBeCloseTo(1);
  });

  it("keeps adding searches up to the cap when the fall is spread out", () => {
    const wide = pickLosingQueries(report(2000), 5);
    expect(wide.picks).toHaveLength(5);
    expect(wide.share).toBeCloseTo(310 / 2000);
  });
});
