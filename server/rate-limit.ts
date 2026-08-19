import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";

const MAX_RETRIES = 3;
const RATE_LIMIT_ERROR = "RATE_LIMIT_EXCEEDED";

export function isRateLimitError(error: unknown) {
  return error instanceof Error && error.message === RATE_LIMIT_ERROR;
}

function isRetryableRateLimitError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export async function assertRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  scope = "default",
) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const now = new Date();
    const nextResetAt = new Date(now.getTime() + windowMs);

    try {
      await prisma.$transaction(
        async (tx) => {
          const existingBucket = await tx.rateLimitBucket.findUnique({
            where: {
              scope_key: {
                scope,
                key,
              },
            },
          });

          if (!existingBucket) {
            await tx.rateLimitBucket.create({
              data: {
                scope,
                key,
                count: 1,
                resetAt: nextResetAt,
              },
            });
            return;
          }

          if (existingBucket.resetAt <= now) {
            await tx.rateLimitBucket.update({
              where: { id: existingBucket.id },
              data: {
                count: 1,
                resetAt: nextResetAt,
              },
            });
            return;
          }

          if (existingBucket.count >= limit) {
            throw new Error(RATE_LIMIT_ERROR);
          }

          await tx.rateLimitBucket.update({
            where: { id: existingBucket.id },
            data: {
              count: {
                increment: 1,
              },
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      return;
    } catch (error) {
      if (isRateLimitError(error)) {
        throw error;
      }

      if (isRetryableRateLimitError(error) && attempt < MAX_RETRIES - 1) {
        continue;
      }

      throw error;
    }
  }
}
