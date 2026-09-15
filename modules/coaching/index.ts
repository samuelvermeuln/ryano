/** Public boundary for the coaching domain. */
export { AssignmentStatus } from "./domain/enums";
export { coachAthleteAssignmentSchema, createCoachAthleteAssignment, transitionCoachAthleteAssignment } from "./domain/coach-athlete-assignment";
export type { CoachAthleteAssignment, CreateCoachAthleteAssignmentInput } from "./domain/coach-athlete-assignment";
