import { env } from "@/server/env";

export function isSchoolModuleEnabled(): boolean {
  return env.SCHOOL_MODULE_ENABLED === "true";
}

export function assertSchoolModuleEnabled(): void {
  if (!isSchoolModuleEnabled()) throw new Error("SCHOOL_MODULE_DISABLED");
}
