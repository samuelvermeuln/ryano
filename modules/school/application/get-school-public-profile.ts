import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);

/** What a signed-in athlete sees before asking to join (SAM-24). */
export interface SchoolPublicProfile {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  /** When the school was created on Ryvano — "desde". */
  since: Date;
  sportTypes: string[];
  address: {
    street: string | null;
    number: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
  };
  phoneE164: string | null;
  email: string | null;
  joinPolicy: string;
  coachSelectionPolicy: string;
  activeAthleteCount: number;
  /** Who answers for the school: the OWNER. Name and photo only, never their e-mail. */
  responsible: { name: string | null; image: string | null } | null;
  coaches: Array<{ id: string; displayName: string; bio: string | null; image: string | null }>;
  /** The viewer's own relationship with this school, so the UI can offer the right action. */
  viewer: {
    membershipStatus: "NONE" | "PENDING" | "ACTIVE";
    requestedAt: Date | null;
  };
}

/**
 * Public profile of an ACTIVE school for an authenticated viewer.
 *
 * Exposes contact data the school registered to be found (phone, e-mail,
 * address without postal code) and the people an athlete would train with
 * (active, non-suspended coaches). Never exposes the CNPJ, staff memberships,
 * other athletes, or anyone's personal e-mail. Inactive schools are a 404 to
 * the public, exactly like absent ones.
 */
export class GetSchoolPublicProfile {
  constructor(
    private readonly db: Pick<PrismaClient, "school" | "schoolAthleteMembership" | "coachSchoolMembership">,
  ) {}

  async execute(actorUserId: string | null, schoolId: string): Promise<SchoolPublicProfile> {
    const actor = id.safeParse(actorUserId);
    if (!actor.success) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    const target = id.safeParse(schoolId);
    if (!target.success) throw this.notFound();

    const school = await this.db.school.findUnique({
      where: { id: target.data },
      select: {
        id: true, slug: true, name: true, description: true, logoUrl: true, status: true,
        createdAt: true, sportTypes: true,
        street: true, addressNumber: true, district: true, city: true, state: true,
        phoneE164: true, email: true, joinPolicy: true, coachSelectionPolicy: true,
        owner: { select: { name: true, image: true } },
      },
    });
    if (!school || school.status !== "ACTIVE") throw this.notFound();

    const [activeAthleteCount, coachLinks, viewerMembership] = await Promise.all([
      this.db.schoolAthleteMembership.count({ where: { schoolId: school.id, status: "ACTIVE" } }),
      this.db.coachSchoolMembership.findMany({
        where: { schoolId: school.id, status: "ACTIVE", endedAt: null, suspendedAt: null },
        select: {
          startedAt: true,
          coach: { select: { id: true, displayName: true, bio: true, status: true, user: { select: { image: true } } } },
        },
        orderBy: { startedAt: "asc" },
        take: 50,
      }),
      this.db.schoolAthleteMembership.findFirst({
        where: { schoolId: school.id, athleteId: actor.data, status: { in: ["PENDING", "ACTIVE"] } },
        select: { status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      id: school.id,
      slug: school.slug,
      name: school.name,
      description: school.description,
      logoUrl: school.logoUrl,
      since: school.createdAt,
      sportTypes: school.sportTypes,
      address: {
        street: school.street,
        number: school.addressNumber,
        district: school.district,
        city: school.city,
        state: school.state,
      },
      phoneE164: school.phoneE164,
      email: school.email,
      joinPolicy: school.joinPolicy,
      coachSelectionPolicy: school.coachSelectionPolicy,
      activeAthleteCount,
      responsible: school.owner ? { name: school.owner.name, image: school.owner.image } : null,
      coaches: coachLinks
        .filter((link) => link.coach.status === "ACTIVE")
        .map((link) => ({
          id: link.coach.id,
          displayName: link.coach.displayName,
          bio: link.coach.bio,
          image: link.coach.user.image,
        })),
      viewer: {
        membershipStatus: viewerMembership?.status === "ACTIVE"
          ? "ACTIVE"
          : viewerMembership?.status === "PENDING"
            ? "PENDING"
            : "NONE",
        requestedAt: viewerMembership?.status === "PENDING" ? viewerMembership.createdAt : null,
      },
    };
  }

  private notFound() {
    return new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
  }
}
