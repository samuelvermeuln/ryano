"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { ChangeAthleteCoach } from "@/modules/school/application/change-athlete-coach";
import { AssignCoachToAthlete } from "@/modules/school/application/assign-coach-to-athlete";
import { SetCoachSuspension } from "@/modules/school/application/set-coach-suspension";
import { GetOrganizationChart } from "@/modules/school/application/get-organization-chart";
import { GetAthleteOrganizationDetail } from "@/modules/school/application/get-athlete-organization-detail";
import { GetCoachDetail } from "@/modules/school/application/get-coach-detail";

const changeCoach = new ChangeAthleteCoach(prisma);
const assignCoach = new AssignCoachToAthlete(prisma);
const suspension = new SetCoachSuspension(prisma);
const chart = new GetOrganizationChart(prisma);
const athleteDetail = new GetAthleteOrganizationDetail(prisma);
const coachDetail = new GetCoachDetail(prisma);

export type OrganizationChartData = Awaited<ReturnType<GetOrganizationChart["execute"]>>;
export type AthleteDetailData = Awaited<ReturnType<GetAthleteOrganizationDetail["execute"]>>;
export type CoachDetailData = Awaited<ReturnType<GetCoachDetail["execute"]>>;

/** Mutations return the refreshed chart so the tree updates without a reload. */
export type ChartActionResult =
  | { ok: true; chart: OrganizationChartData; message?: string }
  | { ok: false; message: string };
export type DetailResult<T> = { ok: true; detail: T } | { ok: false; message: string };

const idSchema = z.string().min(1).max(256);
const reasonSchema = z.string().trim().min(1).max(500).nullish();

function toMessage(error: unknown): string {
  if (error instanceof SchoolError) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Dados inválidos.";
  return "Não foi possível concluir a operação. Tente novamente.";
}

async function guard() {
  if (!isSchoolModuleEnabled()) throw new SchoolError("SCHOOL_MODULE_DISABLED", "Recurso indisponível.", 404);
  return requireOnboardedSession();
}

/**
 * Moves an athlete between coaches, or gives a coach to an athlete who had none.
 *
 * The verb is chosen here from the athlete's current state rather than trusted
 * from the client, because the two paths are not interchangeable: transferring
 * has to close the previous period, and assigning refuses to run when one is
 * already open.
 */
export async function transferAthleteAction(input: {
  schoolId: string;
  athleteId: string;
  coachId: string;
  reason?: string | null;
}): Promise<ChartActionResult> {
  try {
    const session = await guard();
    const schoolId = idSchema.parse(input.schoolId);
    const athleteId = idSchema.parse(input.athleteId);
    const coachId = idSchema.parse(input.coachId);
    const reason = reasonSchema.parse(input.reason) ?? null;

    const current = await prisma.coachAthleteAssignment.findFirst({
      where: { schoolId, athleteId, status: "ACTIVE", isPrimary: true },
      select: { id: true },
    });
    if (current) {
      await changeCoach.execute(session.user.id, schoolId, athleteId, coachId, reason);
    } else {
      await assignCoach.execute(session.user.id, schoolId, athleteId, coachId);
    }

    revalidatePath(`/escola/${schoolId}/organograma`);
    revalidatePath(`/escola/${schoolId}/professores`);
    return {
      ok: true,
      chart: await chart.execute(session.user.id, schoolId),
      message: current ? "Aluno transferido com sucesso." : "Aluno vinculado ao professor.",
    };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

export async function setCoachSuspensionAction(input: {
  schoolId: string;
  membershipId: string;
  suspended: boolean;
  reason?: string | null;
}): Promise<ChartActionResult> {
  try {
    const session = await guard();
    const schoolId = idSchema.parse(input.schoolId);
    const membershipId = idSchema.parse(input.membershipId);
    await suspension.execute(session.user.id, schoolId, membershipId, {
      suspended: z.boolean().parse(input.suspended),
      reason: reasonSchema.parse(input.reason) ?? null,
    });

    revalidatePath(`/escola/${schoolId}/organograma`);
    revalidatePath(`/escola/${schoolId}/professores`);
    return {
      ok: true,
      chart: await chart.execute(session.user.id, schoolId),
      message: input.suspended ? "Professor desativado." : "Professor reativado.",
    };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

export async function loadAthleteDetailAction(
  schoolId: string,
  athleteId: string,
): Promise<DetailResult<AthleteDetailData>> {
  try {
    const session = await guard();
    return {
      ok: true,
      detail: await athleteDetail.execute(session.user.id, idSchema.parse(schoolId), idSchema.parse(athleteId)),
    };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

export async function loadCoachDetailAction(
  schoolId: string,
  membershipId: string,
): Promise<DetailResult<CoachDetailData>> {
  try {
    const session = await guard();
    return {
      ok: true,
      detail: await coachDetail.execute(session.user.id, idSchema.parse(schoolId), idSchema.parse(membershipId)),
    };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}
