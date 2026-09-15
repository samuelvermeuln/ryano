import type { PrismaClient } from "@prisma/client";
import { coachProfileSchema, type CoachProfile } from "../domain/coach-profile";

export class CoachProfileService {
  constructor(private readonly profiles: Pick<PrismaClient["coachProfile"], "findUnique">) {}

  async resolveByUserId(rawUserId: string): Promise<CoachProfile | null> {
    const userId = coachProfileSchema.shape.userId.parse(rawUserId);
    const profile = await this.profiles.findUnique({ where: { userId } });
    return profile === null ? null : coachProfileSchema.parse(profile);
  }
}
