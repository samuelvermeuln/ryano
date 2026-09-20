import { z } from "zod";
import { prisma } from "@/server/db";
import { ListTrainingProducts, listTrainingProductsSchema } from "@/modules/school/application/list-training-products";
import { publicSchoolResponse } from "../schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = listTrainingProductsSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const list = new ListTrainingProducts(prisma);

export function GET(request: Request) {
  return publicSchoolResponse(async () => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return list.execute(querySchema.parse(params));
  });
}
