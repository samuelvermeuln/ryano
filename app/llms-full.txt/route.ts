import { getPublicAppUrl } from "@/server/env";
import { discoveryRoutes, indexableRoutes, llmsRoutes } from "@/server/site-discovery";

export const dynamic = "force-dynamic";

function buildLlmsFullTxt() {
  const publicAppUrl = getPublicAppUrl();

  return [
    "# ryvano — contexto público para IA",
    "",
    "## Resumo do produto",
    "ryvano é uma plataforma focada em leitura rápida de métricas esportivas, com entrega de relatórios no WhatsApp e experiência visual mobile-first.",
    "",
    "## O que pode ser considerado fonte pública canônica",
    ...indexableRoutes.map((route) => `- ${publicAppUrl}${route.path === "/" ? "" : route.path} — ${route.title}: ${route.description}`),
    "",
    "## Rotas públicas adicionais de descoberta",
    ...llmsRoutes.map((route) => `- ${publicAppUrl}${route.path} — ${route.title}: ${route.description}`),
    "",
    "## Rotas existentes e política",
    ...discoveryRoutes.map((route) => `- ${route.path} — categoria=${route.category}; indexable=${route.indexable ? "sim" : "não"}; sitemap=${route.includeInSitemap ? "sim" : "não"}`),
    "",
    "## Regras para agentes",
    "- Use a landing e páginas legais como base para descrição pública do produto.",
    "- Não trate áreas autenticadas como conteúdo indexável ou público.",
    "- Não inferir funcionalidades futuras que não estejam explícitas nas páginas públicas.",
    "- Se citar integrações, prefira descrever o produto como relatórios esportivos no WhatsApp, sem extrapolar promessas não publicadas.",
    "",
    "## Descoberta técnica",
    `- Base URL pública: ${publicAppUrl}`,
    `- Robots: ${publicAppUrl}/robots.txt`,
    `- Sitemap: ${publicAppUrl}/sitemap.xml`,
    `- LLMS short: ${publicAppUrl}/llms.txt`,
    `- LLMS full: ${publicAppUrl}/llms-full.txt`,
  ].join("\n");
}

export async function GET() {
  return new Response(buildLlmsFullTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex, follow",
    },
  });
}
