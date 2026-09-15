import { z } from "zod";
import { prisma } from "@/server/db";
import { SearchSchools, searchSchoolsSchema } from "@/modules/school/application/search-schools";
import { publicSchoolResponse } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = searchSchoolsSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const search = new SearchSchools(prisma);

export function GET(request: Request) {
  return publicSchoolResponse(async () => {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return search.execute(query);
  });
}
