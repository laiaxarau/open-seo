// Google Trends (through DataForSEO) for the searches that explain a fall:
// real data about whether people look for the topic less, so the report can
// say it instead of guessing. Every call is billed by DataForSEO and goes to
// the cost ledger under its own feature, apart from the AI.
import { recordCost } from "@/custom/costs/server/ledger";
import { getUsdEurRate } from "@/custom/costs/server/fx";
import type { AiWho } from "@/custom/reporting/server/aiDraft";
import {
  summariseTrend,
  trendSelection,
  type TrendGraph,
} from "@/custom/reporting/server/trendsMath";
import type { ReportFull, TrendLine } from "@/custom/reporting/types";
import { dataforseoPost } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";

/** Google allows 5 searches per Trends request, billed once per request. */
const PER_REQUEST = 5;
const SPAIN = 2724;

export const TRENDS_FEATURE = "report-trends";
const TRENDS_ENDPOINT = "keywords_data/google_trends/explore/live";

type TrendsTask = DataforseoTaskLike & {
  result?: { items?: TrendGraph[] }[];
};

export type TrendsRun = {
  lines: TrendLine[];
  /** How much of the fall the searches asked about explain. */
  coverage: { lostClicks: number; queries: number; share: number | null };
  costEur: number;
  calls: number;
  /** Why nothing was asked, to show on screen. */
  skipped?: string;
};

export async function collectReportTrends(
  report: ReportFull,
  who: AiWho,
): Promise<TrendsRun> {
  const selection = trendSelection(report);
  const keywords = selection.keywords;
  const coverage = {
    lostClicks: selection.lostClicks,
    queries: selection.queries,
    share: selection.share,
  };
  if (keywords.length === 0) {
    return {
      lines: [],
      coverage,
      costEur: 0,
      calls: 0,
      skipped: "sin búsquedas",
    };
  }
  const { snapshot } = report;
  const comparable = snapshot.period.comparable;
  const dateFrom = comparable
    ? snapshot.period.prevStartDate
    : snapshot.range.startDate;
  const batches: string[][] = [];
  for (let from = 0; from < keywords.length; from += PER_REQUEST) {
    batches.push(keywords.slice(from, from + PER_REQUEST));
  }
  const fetchedAt = new Date().toISOString();
  let costUsd = 0;
  let calls = 0;
  const lines: TrendLine[] = [];
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const response = await dataforseoPost<TrendsTask>(
          "/v3/keywords_data/google_trends/explore/live",
          [
            {
              keywords: batch,
              location_code: SPAIN,
              language_code: "es",
              type: "web",
              date_from: dateFrom,
              date_to: snapshot.range.endDate,
              item_types: ["google_trends_graph"],
            },
          ],
        );
        const task = assertOk(response);
        const billing = buildTaskBilling(task);
        costUsd += billing.costUsd;
        calls += 1;
        await recordCost({
          organizationId: who.organizationId,
          userEmail: who.userEmail,
          projectId: report.projectId,
          feature: TRENDS_FEATURE,
          endpoint: TRENDS_ENDPOINT,
          costUsd: billing.costUsd,
          outcome: "ok",
        }).catch((error) =>
          console.error("[report-trends] could not record the cost", error),
        );
        const graph = task.result?.[0]?.items?.find(
          (item) => item.type === "google_trends_graph",
        );
        if (graph) {
          for (const line of summariseTrend(
            graph,
            snapshot.range.startDate,
            comparable ? snapshot.period.prevStartDate : null,
          )) {
            lines.push({ ...line, fetchedAt });
          }
        }
      } catch (error) {
        // A report never depends on Trends: without it, the AI just has less.
        console.error("[report-trends] request failed", error);
      }
    }),
  );
  const fx = costUsd > 0 ? await getUsdEurRate().catch(() => null) : null;
  return {
    lines,
    coverage,
    costEur: costUsd * (fx?.rate ?? 0.92),
    calls,
    ...(calls === 0 ? { skipped: "no disponible" } : {}),
  };
}
