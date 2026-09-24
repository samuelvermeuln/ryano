/**
 * TM025 — `PUT /api/coach/products/[id]/draft`: adaptador fino sobre
 * `UpdateTrainingProductDraft` (metadados comerciais/catálogo do produto,
 * RF-102) e, quando o corpo trouxer `version`, também sobre
 * `SaveProductVersionDraft` (TM021 — o rascunho do plano `weeks[]/days[]/
 * sessions[]`).
 *
 * Nota de escopo: TM018–TM030 não reservou uma rota dedicada só para o
 * rascunho de versão do plano (TM024–TM027 listam exatamente 4 rotas, todas
 * as demais amarradas a `UpdateTrainingProductDraft`/`PublishTrainingProduct
 * Version`). Sem uma rota própria, `SaveProductVersionDraft` (TM021) ficaria
 * inacessível a qualquer UI, incluindo o editor de TM029 — que depende
 * diretamente de TM021. Composição aqui (dois `execute()` independentes,
 * cada um delegando 100% ao seu próprio caso de uso) resolve essa lacuna sem
 * inventar uma rota fora do escopo desta trilha; a rota permanece um
 * adaptador — nenhuma regra de negócio própria.
 */
import { prisma } from "@/server/db";
import { UpdateTrainingProductDraft } from "@/modules/school/application/update-training-product-draft";
import { SaveProductVersionDraft } from "@/modules/school/application/save-product-version-draft";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolBody, schoolResponse, type SchoolRouteContext } from "../../../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateDraft = new UpdateTrainingProductDraft(prisma);
const saveVersionDraft = new SaveProductVersionDraft(prisma);

export function PUT(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const { id: productId } = await context.params;
    const body = await schoolBody(request) as Record<string, unknown>;

    const result: { product?: unknown; version?: unknown } = {};
    if ("product" in body) {
      result.product = await updateDraft.execute(actorId, { ...(body.product as Record<string, unknown>), productId });
    }
    if ("version" in body) {
      result.version = await saveVersionDraft.execute(actorId, { ...(body.version as Record<string, unknown>), productId });
    }
    return result;
  });
}
