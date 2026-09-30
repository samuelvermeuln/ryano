"use server";

/**
 * Server actions of the athlete hub. Thin adapters: parse the form, delegate to
 * the use case, revalidate. Every authorization decision belongs to the use case
 * (`ResolveCoachAthleteContext`), never to this layer and never to the URL.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { PrescribeWorkoutToAthlete } from "@/modules/school/application/prescribe-workout-to-athlete";
import { SaveAthleteTechnicalSheet } from "@/modules/school/application/save-athlete-technical-sheet";
import { SchoolError } from "@/modules/school/domain/errors";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

const prescribeWorkout = new PrescribeWorkoutToAthlete(prisma);
const saveTechnicalSheet = new SaveAthleteTechnicalSheet(prisma);

export type AthleteHubActionState = {
  message?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
};

const routeSchema = z.object({
  schoolId: z.string().min(1),
  athleteId: z.string().min(1),
});

/** Zod issue paths → flat field errors, the shape the forms already render. */
function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    // Nested block paths collapse to "blocks" — the builder highlights the
    // section, and a per-index key would not match any input name.
    const key = issue.path.length > 0 ? String(issue.path[0]) : "form";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalText(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * The block structure arrives as JSON from the builder: a repeating,
 * variable-length structure with nested targets does not survive flat form
 * fields without inventing an index-encoding convention on both sides.
 */
const blocksPayloadSchema = z.string().min(1, "Adicione ao menos um bloco.").transform((value, ctx) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    ctx.addIssue({ code: "custom", message: "Não foi possível ler a estrutura do treino." });
    return z.NEVER;
  }
});

export async function prescribeWorkoutAction(
  _prev: AthleteHubActionState,
  formData: FormData,
): Promise<AthleteHubActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const route = routeSchema.safeParse({
    schoolId: formData.get("schoolId"),
    athleteId: formData.get("athleteId"),
  });
  if (!route.success) return { message: "Requisição inválida." };

  const blocks = blocksPayloadSchema.safeParse(formData.get("blocks") ?? "");
  if (!blocks.success) return { fieldErrors: { blocks: blocks.error.issues[0]?.message ?? "Estrutura inválida." } };

  try {
    await prescribeWorkout.execute(session.user.id, route.data.schoolId, route.data.athleteId, {
      title: formData.get("title") ?? "",
      sportType: formData.get("sportType") ?? "",
      description: optionalText(formData.get("description")),
      // SAM-16 — `datetime-local` has no zone; the use case reads it in the
      // school's zone and stores the UTC instant.
      scheduledAtLocal: String(formData.get("scheduledAt") ?? ""),
      teamId: optionalText(formData.get("teamId")),
      blocks: blocks.data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { fieldErrors: toFieldErrors(error) };
    if (error instanceof SchoolError) return { message: error.message };
    return { message: "Não foi possível prescrever o treino agora. Tente novamente." };
  }

  const base = `/professor/${route.data.schoolId}/atletas/${route.data.athleteId}`;
  revalidatePath(base);
  revalidatePath(`${base}/treinos`);
  revalidatePath(`${base}/analise`);
  return { success: true };
}

export async function saveTechnicalSheetAction(
  _prev: AthleteHubActionState,
  formData: FormData,
): Promise<AthleteHubActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const route = routeSchema.safeParse({
    schoolId: formData.get("schoolId"),
    athleteId: formData.get("athleteId"),
  });
  if (!route.success) return { message: "Requisição inválida." };

  try {
    await saveTechnicalSheet.execute(session.user.id, route.data.schoolId, route.data.athleteId, {
      sportTypes: formData.getAll("sportTypes").filter((value): value is string => typeof value === "string"),
      experienceLevel: optionalText(formData.get("experienceLevel")),
      goals: optionalText(formData.get("goals")),
      targetEvent: optionalText(formData.get("targetEvent")),
      targetEventDate: optionalText(formData.get("targetEventDate")),
      availability: optionalText(formData.get("availability")),
      equipment: optionalText(formData.get("equipment")),
      restrictions: optionalText(formData.get("restrictions")),
      maxHeartRate: optionalNumber(formData.get("maxHeartRate")),
      thresholdHeartRate: optionalNumber(formData.get("thresholdHeartRate")),
      restingHeartRate: optionalNumber(formData.get("restingHeartRate")),
      // Entered as mm:ss by the coach; the domain stores seconds.
      thresholdPaceSecPerKm: parsePace(formData.get("thresholdPaceSecPerKm")),
      ftpWatts: optionalNumber(formData.get("ftpWatts")),
      cssSecPer100m: parsePace(formData.get("cssSecPer100m")),
      notes: optionalText(formData.get("notes")),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { fieldErrors: toFieldErrors(error) };
    if (error instanceof SchoolError) return { message: error.message };
    return { message: "Não foi possível salvar a ficha técnica agora. Tente novamente." };
  }

  revalidatePath(`/professor/${route.data.schoolId}/atletas/${route.data.athleteId}/ficha-tecnica`);
  return { success: true };
}

/**
 * Accepts "4:15" or plain seconds. Coaches write pace as mm:ss, and forcing them
 * to convert is how a 4:15 threshold gets stored as 415 seconds.
 */
function parsePace(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const text = value.trim();
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}
