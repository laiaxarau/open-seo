// The arithmetic of Google Trends, apart from the network (so it can be
// tested): the interest of a search in the period and in the one before, and
// the choice of searches worth asking about.
import { pickLosingQueries } from "@/custom/reporting/server/searchSelection";
import type { ReportFull, TrendLine } from "@/custom/reporting/types";

/** At most three requests (fifteen searches) for each report. */
const MAX_KEYWORDS = 15;

type TrendPoint = {
  date_from?: string;
  missing_data?: boolean;
  values?: (number | null)[];
};

export type TrendGraph = {
  type?: string;
  keywords?: string[];
  data?: TrendPoint[];
};

const average = (values: number[]) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const round1 = (value: number) => Math.round(value * 10) / 10;

/** The average interest of each search in the period and in the one before
 *  (0 to 100, relative to the highest point Google shows for the request) and
 *  how much it changed. */
export function summariseTrend(
  graph: TrendGraph,
  split: string,
  prevStart: string | null,
): Omit<TrendLine, "fetchedAt">[] {
  const points = (graph.data ?? []).filter(
    (point) => point.date_from && !point.missing_data,
  );
  return (graph.keywords ?? []).flatMap((query, index) => {
    const read = (inWindow: (from: string) => boolean) =>
      points
        .filter((point) => inWindow(point.date_from ?? ""))
        .map((point) => point.values?.[index])
        .filter((value): value is number => typeof value === "number");
    const now = average(read((from) => from >= split));
    const before = prevStart
      ? average(read((from) => from >= prevStart && from < split))
      : null;
    if (now === null) return [];
    return [
      {
        query,
        now: round1(now),
        before: before === null ? null : round1(before),
        change: before !== null && before > 0 ? now / before - 1 : null,
        from: prevStart ?? split,
        to: points.at(-1)?.date_from ?? split,
      },
    ];
  });
}

/** The searches worth asking Google Trends about. Google Trends only has
 *  figures for searches with enough volume and scales each request to its
 *  biggest term, so: the topics of the site come first (broad terms it
 *  knows), then the searches that lose most clicks until they explain enough
 *  of the fall, and the list is sorted by volume so each request of five
 *  holds terms of a similar size. */
export function trendSelection(report: ReportFull): {
  keywords: string[];
  lostClicks: number;
  share: number | null;
  queries: number;
} {
  const { snapshot } = report;
  const volume = new Map<string, number>();
  for (const row of snapshot.queryRows ?? []) {
    volume.set(row.query, row.impressions);
  }
  for (const topic of snapshot.topics ?? []) {
    volume.set(topic.label, topic.impressions);
  }
  const topics = (snapshot.topics ?? [])
    .slice(0, 3)
    .map((topic) => topic.label.trim())
    .filter((label) => label.length > 0 && label.length <= 100);
  const selection = pickLosingQueries(
    report,
    Math.max(0, MAX_KEYWORDS - topics.length),
  );
  const keywords = [
    ...new Set([...topics, ...selection.picks.map((item) => item.query)]),
  ].slice(0, MAX_KEYWORDS);
  keywords.sort((x, y) => (volume.get(y) ?? 0) - (volume.get(x) ?? 0));
  return {
    keywords,
    lostClicks: selection.lostClicks,
    share: selection.share,
    queries: selection.picks.length,
  };
}

export const trendKeywords = (report: ReportFull): string[] =>
  trendSelection(report).keywords;
