import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

/** Internal maintenance operation; job entrypoints must enforce SCHOOL_MODULE_ENABLED. */
export class ExpireInvitations {
  constructor(
    private readonly db: Pick<PrismaClient | Prisma.TransactionClient, "invitationLink">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<{ expiredCount: number }> {
    const now = z.date().parse(this.clock());
    // One atomic predicate/update uses the (status, expiresAt) index. Concurrent
    // runs recheck ACTIVE, so only one can count a transition. Null expiry never matches.
    const { count } = await this.db.invitationLink.updateMany({
      where: {
        status: "ACTIVE",
        revokedAt: null,
        expiresAt: { lte: now },
        // A delayed worker/clock must not overwrite a newer state timestamp.
        updatedAt: { lte: now },
      },
      data: { status: "EXPIRED", updatedAt: now },
    });
    return { expiredCount: count };
  }
}
