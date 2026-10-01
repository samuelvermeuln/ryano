import { z } from "zod";
import { prisma } from "@/server/db";
import { SearchCoaches, searchCoachesSchema } from "@/modules/school/application/search-coaches";
import { schoolResponse } from "@/app/api/schools/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = searchCoachesSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const search = new SearchCoaches(prisma);

/**
 * SAM-25 — athlete-facing coach discovery by name or exact e-mail. Requires a
 * session: the e-mail lookup is for people who already know the coach, not for
 * enumerating accounts from outside.
 */
export function GET(request: Request) {
  return schoolResponse(async () => {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return search.execute(query);
  });
}
