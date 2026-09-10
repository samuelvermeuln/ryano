/** Public boundary for the school domain. */
export { CoachStatus } from "./domain/enums";
export { coachProfileSchema, createCoachProfile } from "./domain/coach-profile";
export type { CoachProfile, CreateCoachProfileInput } from "./domain/coach-profile";
export { CoachProfileService } from "./application/coach-profile-service";
export { coachSchoolMembershipSchema, createCoachSchoolMembership, transitionCoachSchoolMembership } from "./domain/coach-school-membership";
export type { CoachSchoolMembership, CreateCoachSchoolMembershipInput } from "./domain/coach-school-membership";
export { schoolAthleteMembershipSchema, createSchoolAthleteMembership, transitionSchoolAthleteMembership } from "./domain/school-athlete-membership";
export type { SchoolAthleteMembership, CreateSchoolAthleteMembershipInput } from "./domain/school-athlete-membership";
