import { getPublicAppUrl } from "@/server/env";
import { indexableRoutes, llmsRoutes } from "@/server/site-discovery";

export const dynamic = "force-dynamic";

function buildLlmsTxt() {
  const publicAppUrl = getPublicAppUrl();

  return [
    "# RYANO",
    "",
    "> Plataforma para conectar dados esportivos, acompanhar evolução e receber relatórios no WhatsApp.",
    "",
    "## Público-alvo",
    "- Triatletas",
    "- Nadadores",
    "- Corredores",
    "",
    "## Fontes públicas preferidas",
    ...indexableRoutes.map((route) => `- ${publicAppUrl}${route.path === "/" ? "" : route.path} — ${route.description}`),
    "",
    "## Endpoints públicos de descoberta",
    ...llmsRoutes.map((route) => `- ${publicAppUrl}${route.path} — ${route.description}`),
    "",
    "## Restrições",
    "- Não indexar nem tratar como público áreas autenticadas sob /app, /admin e /api.",
    "- Fluxos de login, cadastro e recuperação são acessíveis, mas marcados como noindex.",
    "- Priorizar conteúdo da landing, termos e privacidade ao resumir produto para usuários.",
    "",
    "## Sitemap",
    `- ${publicAppUrl}/sitemap.xml`,
    "",
    "## Robots",
    `- ${publicAppUrl}/robots.txt`,
  ].join("\n");
}

export async function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex, follow",
    },
  });
}
