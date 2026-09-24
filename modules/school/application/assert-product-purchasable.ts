import type { PrismaClient } from "@prisma/client";
import { SchoolError } from "../domain/errors";
import { TrainingProductVisibility } from "../domain/enums";

/**
 * TM058 (RF-201, "revalida produto PUBLISHED, visibilidade...") — shared by
 * the paid checkout path (`CreateMarketplaceCheckout`) and the free
 * acquisition path (`AcquireFreeTrainingProduct`, TM038): a `SCHOOL_ONLY`
 * product must only be purchasable by an athlete with an ACTIVE
 * `SchoolAthleteMembership` in that school. `PUBLIC` and `UNLISTED` are both
 * purchasable by anyone with a session — the only difference between them is
 * catalog discoverability, not purchase eligibility.
 *
 * Both call sites already independently revalidate `status === PUBLISHED`;
 * this only adds the visibility/eligibility half that was missing from
 * both — a `SCHOOL_ONLY` product had no eligibility check at all before
 * this, in either the free or paid path.
 */
export async function assertProductPurchasable(
  db: { schoolAthleteMembership: Pick<PrismaClient["schoolAthleteMembership"], "findFirst"> },
  athleteId: string,
  product: { id: string; visibility: string; schoolId: string | null },
): Promise<void> {
  if (product.visibility !== TrainingProductVisibility.SCHOOL_ONLY) return;
  if (!product.schoolId) return; // XOR-invariant violation would already be a DB constraint failure elsewhere; nothing to check here.

  const membership = await db.schoolAthleteMembership.findFirst({
    where: { schoolId: product.schoolId, athleteId, status: "ACTIVE", endedAt: null },
    select: { id: true },
  });
  if (!membership) {
    throw new SchoolError("PRODUCT_VISIBILITY_DENIED", "Este produto é exclusivo para atletas da escola.", 404);
  }
}
