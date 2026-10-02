/**
 * SAM-29/SAM-30 — the athlete follows the coach INTO a school: once the link at
 * that school is ACTIVE, every other ACTIVE link of the same (athlete, coach)
 * pair — independent or at another school — closes, so the pair never runs two
 * parallel coachings. Extracted from `ApproveAthleteMembership` so the coach's
 * own acceptance (`DecideCoachAssignmentRequest`) applies the exact same rule.
 */
import type { Prisma } from "@prisma/client";

export function endOtherCoachingLinksOfPair(
  tx: Pick<Prisma.TransactionClient, "coachAthleteAssignment">,
  input: { athleteId: string; coachId: string; keepSchoolId: string; now: Date; endedBy: string },
) {
  return tx.coachAthleteAssignment.updateMany({
    // Spelled out: `NOT: { schoolId }` would skip the independent (NULL) link.
    where: {
      athleteId: input.athleteId,
      coachId: input.coachId,
      status: "ACTIVE",
      OR: [{ schoolId: null }, { schoolId: { not: input.keepSchoolId } }],
    },
    data: { status: "ENDED", endedAt: input.now, endedBy: input.endedBy, updatedAt: input.now },
  });
}
