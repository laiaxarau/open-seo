// What Google's results page shows for the searches that lose the most clicks
// (a live query through DataForSEO, one page of results, on desktop, in
// Spain): AI answers, videos, featured snippets… above the site's result help
// to explain clicks that fall while the positions do not. Every query is
// billed by DataForSEO and goes to the cost ledger under its own feature.
import { recordCost } from "@/custom/costs/server/ledger";
import { getUsdEurRate } from "@/custom/costs/server/fx";
import type { AiWho } from "@/custom/reporting/server/aiDraft";
import { pickLosingQueries } from "@/custom/reporting/server/searchSelection";
import { ownDomainOf, summariseSerp } from "@/custom/reporting/server/serpMath";
import type { ReportFull, SerpLine } from "@/custom/reporting/types";
import { fetchLiveSerp } from "@/server/lib/dataforseo/serp";

/** At most twenty searches for each report (about 0,04 $): the limit is the
 *  number of calls a Worker may make in one go, not the price. */
const MAX_SEARCHES = 20;
const SPAIN = 2724;

export const SERP_COST_FEATURE = "report-serp";
const SERP_ENDPOINT = "serp/google/organic/live/advanced";

export type SerpRun = {
  lines: SerpLine[];
  coverage: { lostClicks: number; queries: number; share: number | null };
  costEur: number;
  calls: number;
};

export async function collectSerpFeatures(
  report: ReportFull,
  who: AiWho,
): Promise<SerpRun> {
  const selection = pickLosingQueries(report, MAX_SEARCHES);
  const coverage = {
    lostClicks: selection.lostClicks,
    queries: selection.picks.length,
    share: selection.share,
  };
  const own = ownDomainOf(report.snapshot.siteUrl);
  const fetchedAt = new Date().toISOString();
  let costUsd = 0;
  let calls = 0;
  const lines: SerpLine[] = [];
  await Promise.all(
    selection.picks.map(async ({ query }) => {
      try {
        const result = await fetchLiveSerp({
          keyword: query,
          locationCode: SPAIN,
          languageCode: "es",
          depth: 10,
          device: "desktop",
        });
        costUsd += result.billing.costUsd;
        calls += 1;
        await recordCost({
          organizationId: who.organizationId,
          userEmail: who.userEmail,
          projectId: report.projectId,
          feature: SERP_COST_FEATURE,
          endpoint: SERP_ENDPOINT,
          costUsd: result.billing.costUsd,
          outcome: "ok",
        }).catch((error) =>
          console.error("[report-serp] could not record the cost", error),
        );
        if (result.data.length > 0) {
          lines.push({ ...summariseSerp(query, result.data, own), fetchedAt });
        }
      } catch (error) {
        // A report never depends on this: without it, the AI just has less.
        console.error("[report-serp] request failed", query, error);
      }
    }),
  );
  // Keep the order of importance the selection had.
  const order = new Map(selection.picks.map((item, at) => [item.query, at]));
  lines.sort((a, b) => (order.get(a.query) ?? 0) - (order.get(b.query) ?? 0));
  const fx = costUsd > 0 ? await getUsdEurRate().catch(() => null) : null;
  return { lines, coverage, costEur: costUsd * (fx?.rate ?? 0.92), calls };
}
