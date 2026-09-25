import { buildNoIndexMetadata } from "@/server/seo";
import { NotFoundContent } from "./not-found-content";

/**
 * Next.js's special not-found file — rendered for any unmatched route across
 * the whole app, and whenever a page calls `notFound()`. A Server Component
 * so it can export `metadata` (client components can't); all the animated,
 * interactive chrome lives in `NotFoundContent`.
 */
export const metadata = buildNoIndexMetadata({
  title: "Página não encontrada — Ryvano",
  description: "A página que você procura não existe, foi movida ou o endereço está incorreto.",
  path: "/404",
});

export default function NotFound() {
  return <NotFoundContent />;
}
