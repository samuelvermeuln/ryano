import { describe, expect, it } from "vitest";
import * as enums from "@/modules/school/domain/enums";

describe("school vocabulary [T010]", () => {
  it("exposes the exact design vocabulary without mutually exclusive user roles", () => {
    expect(Object.values(enums.SchoolStatus)).toEqual(["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED"]);
    expect(Object.values(enums.SchoolJoinPolicy)).toEqual(["AUTO_APPROVE", "REQUIRE_APPROVAL", "INVITE_ONLY"]);
    expect(Object.values(enums.CoachSelectionPolicy)).toEqual(["ATHLETE_CHOOSES", "ADMIN_ASSIGNS", "AUTO_LOBBY", "INVITE_DEFINES_COACH"]);
    expect(Object.values(enums.MembershipStatus)).toEqual(["PENDING", "ACTIVE", "REJECTED", "REVOKED", "ENDED"]);
    expect(Object.values(enums.SchoolRole)).toEqual(["OWNER", "ADMIN", "COACH", "ASSISTANT_COACH", "STAFF", "ATHLETE", "GUARDIAN"]);
    expect(Object.values(enums.MembershipJoinSource)).toEqual(["SCHOOL_INVITE", "SCHOOL_COACH_INVITE", "COACH_INVITE", "MANUAL_SEARCH", "ADMIN_CREATED", "MIGRATION"]);
  });
});
