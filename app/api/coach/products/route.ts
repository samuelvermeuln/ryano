/**
 * TM024/TM027 — Coleção de produtos do estúdio do professor.
 *
 * `POST` cria um rascunho (RF-101). `GET` é a listagem autenticada "meus
 * produtos" — a contraparte de RF-001/design D-01: nunca um parâmetro que
 * eleva a rota pública, sempre uma rota separada com ator obrigatório.
 * Ambas ficam atrás de `assertMarketplaceEnabled()` (RNF-009).
 */
import { z } from "zod";
import { prisma } from "@/server/db";
import { CreateTrainingProductDraft } from "@/modules/school/application/create-training-product-draft";
import { ListOwnTrainingProducts, listOwnTrainingProductsSchema } from "@/modules/school/application/list-own-training-products";
import { assertMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { schoolBody, schoolResponse } from "../../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Query strings arrive as text; coerce `limit` the same way
// `app/api/training-products/route.ts` (TM001) already does for the public
// listing — the use case's own schema stays strict for direct/internal callers.
const listQuerySchema = listOwnTrainingProductsSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createDraft = new CreateTrainingProductDraft(prisma);
const listOwn = new ListOwnTrainingProducts(prisma);

export function POST(request: Request) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    return createDraft.execute(actorId, await schoolBody(request));
  }, 201);
}

export function GET(request: Request) {
  return schoolResponse(async (actorId) => {
    assertMarketplaceEnabled();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return listOwn.execute(actorId, listQuerySchema.parse(params));
  });
}
