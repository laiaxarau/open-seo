// The names of the blocks of Google's results page, shared by the report, the
// findings and the AI (no imports of its own beyond a type).
import type { SerpFeatureType, SerpLine } from "@/custom/reporting/types";

export const SERP_LABEL: Record<SerpFeatureType, string> = {
  ai_overview: "Respuesta de IA",
  featured_snippet: "Fragmento destacado",
  answer_box: "Respuesta directa",
  people_also_ask: "Preguntas relacionadas",
  video: "Vídeos",
  shopping: "Compras",
  local_pack: "Mapa local",
  top_stories: "Noticias",
  images: "Imágenes",
  knowledge_graph: "Panel de conocimiento",
  paid: "Anuncios",
};

/** The blocks that most often take the click from the first organic results. */
export const SERP_TAKES_CLICKS: SerpFeatureType[] = [
  "ai_overview",
  "featured_snippet",
  "answer_box",
  "video",
  "shopping",
  "local_pack",
  "top_stories",
  "paid",
];

/** The blocks of a search that sit above the site's result and take clicks. */
export function featuresAbove(line: SerpLine): SerpFeatureType[] {
  return line.features
    .filter((item) => item.above && SERP_TAKES_CLICKS.includes(item.type))
    .map((item) => item.type);
}
