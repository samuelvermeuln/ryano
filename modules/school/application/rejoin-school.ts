import type { PrismaClient } from "@prisma/client";
import { RequestSchoolMembership } from "./request-school-membership";

export class RejoinSchool {
  private readonly request: RequestSchoolMembership;

  constructor(db: PrismaClient, clock: () => Date = () => new Date()) {
    this.request = new RequestSchoolMembership(db, clock);
  }

  execute(actorUserId: string | null, schoolId: string) {
    // Returning follows the same approval flow: a new pending period, never a
    // reopened historical membership or an inherited approval (ADR-002).
    return this.request.execute(actorUserId, schoolId);
  }
}
