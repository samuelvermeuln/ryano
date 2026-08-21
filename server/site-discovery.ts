export type DiscoveryRoute = {
  path: string;
  title: string;
  description: string;
  category: "marketing" | "legal" | "auth" | "private" | "system";
  indexable: boolean;
  includeInLlms: boolean;
  includeInSitemap: boolean;
  priority?: number;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
};

export const discoveryRoutes: readonly DiscoveryRoute[] = [
  {
    path: "/",
    title: "ryvano",
    description: "Landing pública com proposta de valor de relatórios esportivos no WhatsApp.",
    category: "marketing",
    indexable: true,
    includeInLlms: true,
    includeInSitemap: true,
    priority: 1,
    changeFrequency: "weekly",
  },
  {
    path: "/termos",
    title: "Termos",
    description: "Página pública com status atual dos termos da plataforma.",
    category: "legal",
    indexable: true,
    includeInLlms: true,
    includeInSitemap: true,
    priority: 0.6,
    changeFrequency: "monthly",
  },
  {
    path: "/privacidade",
    title: "Privacidade",
    description: "Página pública com compromisso inicial de privacidade e uso responsável dos dados.",
    category: "legal",
    indexable: true,
    includeInLlms: true,
    includeInSitemap: true,
    priority: 0.6,
    changeFrequency: "monthly",
  },
  {
    path: "/entrar",
    title: "Entrar",
    description: "Acesso por email e senha. Página pública, mas não indexável.",
    category: "auth",
    indexable: false,
    includeInLlms: false,
    includeInSitemap: false,
  },
  {
    path: "/cadastro",
    title: "Cadastro",
    description: "Criação de conta inicial. Página pública, mas não indexável.",
    category: "auth",
    indexable: false,
    includeInLlms: false,
    includeInSitemap: false,
  },
  {
    path: "/recuperar-senha",
    title: "Recuperar senha",
    description: "Fluxo de recuperação de senha. Página pública, mas não indexável.",
    category: "auth",
    indexable: false,
    includeInLlms: false,
    includeInSitemap: false,
  },
  {
    path: "/redefinir-senha",
    title: "Redefinir senha",
    description: "Troca de senha por token. Página pública, mas não indexável.",
    category: "auth",
    indexable: false,
    includeInLlms: false,
    includeInSitemap: false,
  },
  {
    path: "/onboarding",
    title: "Onboarding",
    description: "Fluxo autenticado de ativação de conta.",
    category: "private",
    indexable: false,
    includeInLlms: false,
    includeInSitemap: false,
  },
  {
    path: "/robots.txt",
    title: "robots.txt",
    description: "Política de crawl e indexação da plataforma.",
    category: "system",
    indexable: false,
    includeInLlms: true,
    includeInSitemap: false,
  },
  {
    path: "/sitemap.xml",
    title: "sitemap.xml",
    description: "Mapa dinâmico das rotas públicas indexáveis.",
    category: "system",
    indexable: false,
    includeInLlms: true,
    includeInSitemap: false,
  },
  {
    path: "/llms.txt",
    title: "llms.txt",
    description: "Guia curto para crawlers de IA e ferramentas de busca por IA.",
    category: "system",
    indexable: false,
    includeInLlms: true,
    includeInSitemap: false,
  },
  {
    path: "/llms-full.txt",
    title: "llms-full.txt",
    description: "Guia expandido com contexto público para agentes e sistemas de IA.",
    category: "system",
    indexable: false,
    includeInLlms: true,
    includeInSitemap: false,
  },
] as const;

export const aiCrawlerAgents = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Googlebot",
  "Google-Extended",
  "Bingbot",
  "Applebot",
  "DuckAssistBot",
  "CCBot",
  "Bytespider",
] as const;

export const privatePathPrefixes = ["/app", "/admin", "/api"] as const;

export const privateExactPaths = ["/onboarding"] as const;

export const noIndexExactPaths = discoveryRoutes.filter((route) => !route.indexable).map((route) => route.path);
export const sitemapRoutes = discoveryRoutes.filter((route) => route.includeInSitemap);
export const llmsRoutes = discoveryRoutes.filter((route) => route.includeInLlms);
export const indexableRoutes = discoveryRoutes.filter((route) => route.indexable);
