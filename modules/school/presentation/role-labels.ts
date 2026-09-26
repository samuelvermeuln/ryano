import { SchoolRole } from "../domain/enums";

/** Portuguese labels for the local school roles, shared by every admin screen. */
export const SCHOOL_ROLE_LABELS: Record<SchoolRole, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  COACH: "Professor",
  ASSISTANT_COACH: "Professor assistente",
  STAFF: "Equipe",
  ATHLETE: "Atleta",
  GUARDIAN: "Responsável",
};

/**
 * Roles an administrator may grant through the members UI.
 *
 * OWNER is excluded on purpose: transferring ownership is not an "add a role"
 * operation, and the use cases already reject it unless the actor is the owner.
 */
export const ASSIGNABLE_SCHOOL_ROLES = (Object.keys(SCHOOL_ROLE_LABELS) as SchoolRole[])
  .filter((role) => role !== SchoolRole.OWNER);

export function schoolRoleLabel(role: string) {
  return SCHOOL_ROLE_LABELS[role as SchoolRole] ?? role;
}
