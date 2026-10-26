import { describe, expect, it } from "vitest";
import {
  buildInsights,
  silverLining,
  updateImpacts,
} from "@/custom/reporting/insights";
import type { ReportSnapshot } from "@/custom/reporting/types";

const day = (index: number) =>
  new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10);

// 30 days at 100 clicks a day, except 70 a day while the update runs (days 12-20).
const daily = Array.from({ length: 30 }, (_, index) => ({
  date: day(index),
  clicks: index >= 12 && index <= 20 ? 70 : 100,
  impressions: 3000,
  position: 10,
  prevClicks: 90,
  prevImpressions: 3000,
  prevPosition: 10,
}));

const base = {
  period: { compare: "previous", comparable: true, days: 30 },
  totals: { clicks: 2800, impressions: 90000, ctr: 0.03, position: 10 },
  prevTotals: { clicks: 2700, impressions: 90000, ctr: 0.03, position: 10 },
  daily,
  brand: {
    hasBrand: false,
    clicks: 0,
    prevClicks: 0,
    otherClicks: 0,
    prevOtherClicks: 0,
  },
  topPages: [],
  pageClicksTotal: 0,
  pageWinners: [],
  pageLosers: [],
  bands: [],
  segments: { device: [], pageType: [], intent: [] },
  opportunities: [],
  topics: [],
  health: null,
  discover: null,
  newQueries: 0,
  lostQueries: 0,
  updates: [
    {
      id: "u",
      kind: "core",
      label: "Core update",
      title: "Core",
      begin: day(12),
      end: day(20),
      url: "",
    },
  ],
} as unknown as ReportSnapshot;

describe("updateImpacts", () => {
  it("measures the clicks per day before, during and after an update", () => {
    const [impact] = updateImpacts(base);
    expect(impact.before).toBe(100);
    expect(impact.during).toBe(70);
    expect(impact.after).toBe(100);
    expect(impact.verdict).toContain("30,0 %");
    expect(impact.verdict).toContain("recuperado");
  });
});

describe("buildInsights", () => {
  it("puts the Google update among the findings and gives each one an upside", () => {
    const insights = buildInsights(base);
    expect(insights.some((item) => item.id === "update")).toBe(true);
    expect(insights.every((item) => Boolean(item.upside))).toBe(true);
  });
});

describe("the traffic finding and Google Trends", () => {
  const falling = {
    ...base,
    totals: { clicks: 2500, impressions: 84000, ctr: 0.03, position: 10 },
    prevTotals: { clicks: 2700, impressions: 90000, ctr: 0.03, position: 10 },
  } as unknown as ReportSnapshot;
  const line = (change: number) => ({
    query: "x",
    now: 50,
    before: 50,
    change,
    from: "2026-08-01",
    to: "2026-09-30",
    fetchedAt: "2026-10-26T10:00:00Z",
  });

  it("says Google Trends confirms a fall of demand, naming the source", () => {
    const item = buildInsights(falling, [line(-0.3), line(-0.2)]).find(
      (found) => found.id === "traffic",
    );
    expect(item?.body).toContain("Google Trends lo confirma");
  });

  it("says when Google Trends does not confirm it", () => {
    const item = buildInsights(falling, [line(0.02)]).find(
      (found) => found.id === "traffic",
    );
    expect(item?.body).toContain("Google Trends no confirma");
  });

  it("says Google Trends was asked but has too little data, not that it was not used", () => {
    const item = buildInsights(falling, [
      { ...line(0), change: null, before: null },
    ]).find((found) => found.id === "traffic");
    expect(item?.body).toContain("no tiene datos suficientes");
    expect(item?.body).not.toContain("no hay datos de Google Trends");
  });

  it("admits it is a guess when there is no Google Trends data", () => {
    const item = buildInsights(falling).find((found) => found.id === "traffic");
    expect(item?.body).toContain("no hay datos de Google Trends");
  });
});

describe("the Discover finding", () => {
  const withDiscover = (webClicks: number, top3: number) =>
    ({
      ...base,
      discover: {
        clicks: 4000,
        prevClicks: 3000,
        impressions: 200000,
        webClicks,
        newsClicks: 0,
        concentration: { top3, top10: 0.8, pages: 120 },
        topPages: [],
      },
    }) as unknown as ReportSnapshot;

  it("puts Discover first and warns about concentration for a site that lives on it", () => {
    const items = buildInsights(withDiscover(1000, 0.62));
    const discover = items.find((item) => item.id === "discover");
    expect(discover?.title).toContain("80,0 %");
    expect(discover?.body).toContain("principales");
    expect(discover?.body).toContain("solo 3 páginas");
    expect(items[0]?.id).toBe("discover");
  });

  it("keeps it as a minor finding when search is the main source", () => {
    const items = buildInsights(withDiscover(20000, 0.2));
    const discover = items.find((item) => item.id === "discover");
    expect(discover?.weight).toBeLessThan(60);
    expect(discover?.body).not.toContain("solo 3 páginas");
  });
});

describe("silverLining", () => {
  it("finds something encouraging even when clicks fall", () => {
    const worse = {
      ...base,
      totals: { ...base.totals, clicks: 1500 },
      newQueries: 8,
    } as ReportSnapshot;
    expect(silverLining(worse)).toContain("8 búsquedas nuevas");
  });
});
