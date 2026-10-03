/** SAM-78 — roles in a school's catalog (client-safe labels). */
export const CATALOG_ROLES = ["EDITOR", "REVIEWER", "READER"] as const;
export type CatalogRole = (typeof CATALOG_ROLES)[number];
export const CATALOG_ROLE_LABELS: Record<CatalogRole, string> = { EDITOR: "Editor", REVIEWER: "Revisor", READER: "Leitor" };