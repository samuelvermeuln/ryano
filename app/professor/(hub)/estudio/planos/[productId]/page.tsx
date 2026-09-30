import { permanentRedirect } from "next/navigation";

/** SAM-12 — rota legada: o detalhe do produto é `/professor/estudio/produtos/[productId]`. */
export default async function LegacyPlanoDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  permanentRedirect(`/professor/estudio/produtos/${encodeURIComponent(productId)}`);
}
