// What Google's results page shows for a search, read from a DataForSEO
// "organic live advanced" answer: the blocks that can take the click away and
// who ranks ahead of the site. Pure, so it can be tested.
import type { SerpFeatureType, SerpLine } from "@/custom/reporting/types";

const FEATURES = new Set<string>([
  "ai_overview",
  "featured_snippet",
  "answer_box",
  "people_also_ask",
  "video",
  "shopping",
  "local_pack",
  "top_stories",
  "images",
  "knowledge_graph",
  "paid",
]);

type Item = {
  type: string;
  rank_group?: number | null;
  rank_absolute?: number | null;
  domain?: string | null;
};

const bare = (domain: string) => domain.toLowerCase().replace(/^www\./, "");

/** The domain of a Search Console property ("sc-domain:x.com" or a URL). */
export function ownDomainOf(siteUrl: string): string {
  if (siteUrl.startsWith("sc-domain:")) return bare(siteUrl.slice(10));
  try {
    return bare(new URL(siteUrl).hostname);
  } catch {
    return bare(siteUrl);
  }
}

const isOwn = (domain: string | null | undefined, own: string) => {
  if (!domain) return false;
  const found = bare(domain);
  return found === own || found.endsWith(`.${own}`);
};

export function summariseSerp(
  query: string,
  items: Item[],
  ownDomain: string,
): Omit<SerpLine, "fetchedAt"> {
  const own = items.find(
    (item) => item.type === "organic" && isOwn(item.domain, ownDomain),
  );
  const ownPosition = own?.rank_group ?? null;
  const ownAbsolute = own ? (own.rank_absolute ?? Infinity) : null;
  const features: SerpLine["features"] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!FEATURES.has(item.type) || seen.has(item.type)) continue;
    seen.add(item.type);
    const position = item.rank_absolute ?? item.rank_group ?? 0;
    features.push({
      type: item.type as SerpFeatureType,
      position,
      above: ownAbsolute === null ? true : position < ownAbsolute,
    });
  }
  const ahead: string[] = [];
  for (const item of items) {
    if (item.type !== "organic" || !item.domain) continue;
    if (isOwn(item.domain, ownDomain)) continue;
    const position = item.rank_absolute ?? item.rank_group ?? Infinity;
    if (ownAbsolute !== null && position >= ownAbsolute) continue;
    const domain = bare(item.domain);
    if (!ahead.includes(domain)) ahead.push(domain);
    if (ahead.length >= 3) break;
  }
  return { query, ownPosition, features, ahead };
}
