// The arithmetic of Google Trends, apart from the network (so it can be
// tested): the interest of a search in the period and in the one before, and
// the choice of searches worth asking about.
import type { ReportFull, TrendLine } from "@/custom/reporting/types";

/** At most two requests (ten searches) for each report. */
const MAX_KEYWORDS = 10;

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

/** The searches worth asking Google Trends about: the ones that explain the
 *  pages that fall, then the ones that fall most. Brand searches are left out
 *  (their interest says nothing about the topic). */
export function trendKeywords(report: ReportFull): string[] {
  const { snapshot } = report;
  const brand = new Set(
    (snapshot.queryRows ?? [])
      .filter((row) => row.brand)
      .map((row) => row.query),
  );
  const picked: string[] = [];
  const add = (query: string | undefined) => {
    const keyword = query?.trim();
    if (
      keyword &&
      keyword.length <= 100 &&
      !brand.has(keyword) &&
      !picked.includes(keyword) &&
      picked.length < MAX_KEYWORDS
    ) {
      picked.push(keyword);
    }
  };
  for (const loser of snapshot.pageLosers
    .filter((row) => row.clicksDelta <= -10)
    .slice(0, 3)) {
    for (const move of (loser.queries ?? []).slice(0, 3)) add(move.query);
  }
  for (const row of (snapshot.queryLosers ?? []).slice(0, 6)) add(row.key);
  return picked;
}
