// Which searches are worth asking Google about (Trends, results page): the
// ones that lose the most clicks, enough of them to explain a good part of the
// fall, within a limit that keeps the cost known. Pure, so it can be tested.
import type { ReportFull } from "@/custom/reporting/types";

/** Searches are added until they explain this share of the clicks lost. */
const COVERAGE_TARGET = 0.6;
/** Even when one search explains it all, a few give context. */
const MIN_PICKS = 4;

export type LosingQuery = { query: string; lost: number };

export type Selection = {
  picks: LosingQuery[];
  /** The clicks lost that the share is measured against. */
  lostClicks: number;
  /** The part of those clicks the picks explain (0 to 1), or null. */
  share: number | null;
};

/** The searches that lose most clicks (brand searches left out: their
 *  interest says nothing about the topic), most important first, until they
 *  explain enough of the fall or the cap is reached. */
export function pickLosingQueries(report: ReportFull, cap: number): Selection {
  const { snapshot } = report;
  const brand = new Set(
    (snapshot.queryRows ?? [])
      .filter((row) => row.brand)
      .map((row) => row.query),
  );
  const lostBy = new Map<string, number>();
  for (const row of snapshot.queryLosers ?? []) {
    if (row.clicksDelta < 0) lostBy.set(row.key, -row.clicksDelta);
  }
  for (const page of snapshot.pageLosers ?? []) {
    for (const move of page.queries ?? []) {
      if (move.clicksDelta < 0 && !lostBy.has(move.query)) {
        lostBy.set(move.query, -move.clicksDelta);
      }
    }
  }
  const candidates = [...lostBy.entries()]
    .filter(
      ([query]) =>
        query.trim().length > 0 && query.length <= 100 && !brand.has(query),
    )
    .map(([query, lost]) => ({ query: query.trim(), lost }))
    .sort((a, b) => b.lost - a.lost);
  const net = Math.max(0, snapshot.prevTotals.clicks - snapshot.totals.clicks);
  const candidateTotal = candidates.reduce((sum, item) => sum + item.lost, 0);
  const lostClicks = net > 0 ? net : candidateTotal;
  const picks: LosingQuery[] = [];
  let covered = 0;
  for (const item of candidates) {
    if (picks.length >= cap) break;
    if (
      picks.length >= MIN_PICKS &&
      lostClicks > 0 &&
      covered >= lostClicks * COVERAGE_TARGET
    ) {
      break;
    }
    picks.push(item);
    covered += item.lost;
  }
  return {
    picks,
    lostClicks,
    share: lostClicks > 0 ? Math.min(1, covered / lostClicks) : null,
  };
}
