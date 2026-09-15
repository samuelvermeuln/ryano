import { expect, it } from "vitest";
import { MembershipJoinSource, MembershipStatus } from "@/modules/school/domain/enums";
import { createSchoolAthleteMembership, transitionSchoolAthleteMembership } from "@/modules/school/domain/school-athlete-membership";

it("keeps athlete-school history temporal [T047]", () => {
  const requested = createSchoolAthleteMembership({ id: "membership", schoolId: "school", athleteId: "athlete", joinSource: MembershipJoinSource.MANUAL_SEARCH }, new Date("2026-09-09T10:00:00Z"));
  const active = transitionSchoolAthleteMembership(requested, MembershipStatus.ACTIVE, new Date("2026-09-09T11:00:00Z"), "admin");
  expect(active).toMatchObject({ status: "ACTIVE", startedAt: new Date("2026-09-09T11:00:00Z"), approvedBy: "admin" });
  expect(transitionSchoolAthleteMembership(active, MembershipStatus.ENDED, new Date("2026-09-09T12:00:00Z"))).toMatchObject({ status: "ENDED", endedAt: new Date("2026-09-09T12:00:00Z") });
});
