"use server";

/**
 * Server actions of the athlete hub. Thin adapters: parse the form, delegate to
 * the use case, revalidate. Every authorization decision belongs to the use case
 * (`ResolveCoachAthleteContext`), never to this layer and never to the URL.
 *
 * SAM-30 — the hidden `schoolId` field is empty for the independent hub; the
 * use cases take the scope and refuse anything the actor may not touch.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { PrescribeWorkoutToAthlete } from "@/modules/school/application/prescribe-workout-to-athlete";
import { PrescriptionDrafts, ReviseWorkoutAssignment } from "@/modules/school/application/prescription-revisions";
import { ProposeAthleteTransfer } from "@/modules/school/application/propose-athlete-transfer";
import { SaveAthleteTechnicalSheet } from "@/modules/school/application/save-athlete-technical-sheet";
import { PromoteAthleteAssessment, RecordAthleteAssessment } from "@/modules/school/application/athlete-assessments";
import { AssignZoneProfile, SaveZoneProfile } from "@/modules/school/application/zone-profiles";
import { boundsFromList, type ZoneFamily } from "@/modules/school/domain/zone-profile";
import { SchoolError } from "@/modules/school/domain/errors";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { hubBasePath, INDEPENDENT_SCOPE, scopeFromFormValue } from "./hub-scope";

const prescribeWorkout = new PrescribeWorkoutToAthlete(prisma);
const drafts = new PrescriptionDrafts(prisma);
const reviseWorkout = new ReviseWorkoutAssignment(prisma);
const saveTechnicalSheet = new SaveAthleteTechnicalSheet(prisma);
const proposeTransfer = new ProposeAthleteTransfer(prisma);

export type AthleteHubActionState = {
  message?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  /** SAM-59 — the draft just saved, so the next save updates it (with its version). */
  draftId?: string;
  draftVersion?: number;
  /** SAM-59 — a concurrent edit: the coach reloads, the local form stays on screen. */
  conflict?: boolean;
};

const routeSchema = z.object({
  /** Empty or absent = independent hub. */
  schoolId: z.string().optional().transform((value) => (value ? value : null)),
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

/** A JSON form field; unreadable JSON becomes a value the domain schema rejects with a message. */
function parseJsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return "invalid";
  }
}

/** SAM-65/69 — a JSON section of the builder (open water, v2 structure); absent means "not used". */
function openWaterField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return "invalid";
  }
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

function parseRoute(formData: FormData) {
  const route = routeSchema.safeParse({
    schoolId: formData.get("schoolId") ?? undefined,
    athleteId: formData.get("athleteId"),
  });
  if (!route.success) return null;
  return { scope: scopeFromFormValue(route.data.schoolId), athleteId: route.data.athleteId };
}

export async function prescribeWorkoutAction(
  _prev: AthleteHubActionState,
  formData: FormData,
): Promise<AthleteHubActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const route = parseRoute(formData);
  if (!route) return { message: "Requisição inválida." };

  const blocks = blocksPayloadSchema.safeParse(formData.get("blocks") ?? "");
  if (!blocks.success) return { fieldErrors: { blocks: blocks.error.issues[0]?.message ?? "Estrutura inválida." } };

  try {
    await prescribeWorkout.execute(session.user.id, route.scope, route.athleteId, {
      title: formData.get("title") ?? "",
      sportType: formData.get("sportType") ?? "",
      description: optionalText(formData.get("description")),
      // SAM-16 — `datetime-local` has no zone; the use case reads it in the
      // calendar's zone and stores the UTC instant.
      scheduledAtLocal: String(formData.get("scheduledAt") ?? ""),
      teamId: optionalText(formData.get("teamId")),
      blocks: blocks.data,
      // SAM-58 — "Usar este modelo": which catalog version the coach started from.
      templateId: optionalText(formData.get("templateId")),
      templateVersion: optionalText(formData.get("templateVersion")) ? Number(formData.get("templateVersion")) : null,
      // SAM-65 — the open-water section of the builder, when the sport is open water.
      openWater: openWaterField(formData.get("openWater")),
      // SAM-69 — the v2 structure, when the coach used the advanced builder.
      sessionV2: openWaterField(formData.get("sessionV2")),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { fieldErrors: toFieldErrors(error) };
    if (error instanceof SchoolError) return { message: error.message };
    return { message: "Não foi possível prescrever o treino agora. Tente novamente." };
  }

  const base = hubBasePath(route.scope, route.athleteId);
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

  const route = parseRoute(formData);
  if (!route) return { message: "Requisição inválida." };

  try {
    await saveTechnicalSheet.execute(session.user.id, route.scope, route.athleteId, {
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
      heartRateZoneMethod: optionalText(formData.get("heartRateZoneMethod")),
      notes: optionalText(formData.get("notes")),
      // SAM-50 — the editor sends the whole list as JSON; absent = untouched.
      ...(formData.has("sportLevels") ? { sportLevels: parseJsonField(formData.get("sportLevels")) } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Level rows report under one key the editor shows next to the list.
      const fieldErrors = toFieldErrors(error);
      const isLevelError = error.issues.some((issue) => typeof issue.path[0] === "number");
      return { fieldErrors: isLevelError ? { sportLevels: error.issues[0]?.message ?? "Nível inválido." } : fieldErrors };
    }
    if (error instanceof SchoolError) return { message: error.message };
    return { message: "Não foi possível salvar a ficha técnica agora. Tente novamente." };
  }

  revalidatePath(`${hubBasePath(route.scope, route.athleteId)}/ficha-tecnica`);
  return { success: true };
}

const transferSchema = z.object({
  kind: z.enum(["to-school", "to-independent"]),
  athleteId: z.string().min(1),
  schoolId: z.string().min(1, "Escolha a escola."),
});

/**
 * SAM-30 — the coach proposes moving the athlete into a school (`to-school`,
 * `schoolId` = target) or out of one (`to-independent`, `schoolId` = source).
 * The use case validates every link; the athlete confirms afterwards.
 */
export async function proposeTransferAction(
  _prev: AthleteHubActionState,
  formData: FormData,
): Promise<AthleteHubActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  const parsed = transferSchema.safeParse({
    kind: formData.get("kind"),
    athleteId: formData.get("athleteId"),
    schoolId: formData.get("schoolId"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  try {
    await proposeTransfer.execute(session.user.id, parsed.data);
  } catch (error) {
    if (error instanceof z.ZodError) return { fieldErrors: toFieldErrors(error) };
    if (error instanceof SchoolError) return { message: error.message };
    return { message: "Não foi possível enviar a proposta agora. Tente novamente." };
  }

  // Both hubs may show the proposal's state.
  revalidatePath(hubBasePath(INDEPENDENT_SCOPE, parsed.data.athleteId));
  revalidatePath(hubBasePath({ kind: "school", schoolId: parsed.data.schoolId }, parsed.data.athleteId));
  revalidatePath("/professor/independente");
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

/** SAM-59 — the builder's fields as one prescription payload (shared by draft, publish and revise). */
function prescriptionPayload(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    sportType: String(formData.get("sportType") ?? ""),
    description: optionalText(formData.get("description")) ?? null,
    scheduledAtLocal: optionalText(formData.get("scheduledAt")) ?? null,
    teamId: optionalText(formData.get("teamId")) ?? null,
    blocks: parseJsonField(formData.get("blocks")),
    templateId: optionalText(formData.get("templateId")) ?? null,
    templateVersion: optionalNumber(formData.get("templateVersion")) ?? null,
    openWater: openWaterField(formData.get("openWater")),
    sessionV2: openWaterField(formData.get("sessionV2")),
  };
}

function revalidateHub(scope: ReturnType<typeof scopeFromFormValue>, athleteId: string) {
  const base = hubBasePath(scope, athleteId);
  revalidatePath(base);
  revalidatePath(`${base}/treinos`);
  revalidatePath(`${base}/analise`);
}

/** SAM-59 — "Salvar rascunho": coach-only, invisible to the athlete. */
export async function saveDraftAction(_prev: AthleteHubActionState, formData: FormData): Promise<AthleteHubActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();
  const route = parseRoute(formData);
  if (!route) return { message: "Requisição inválida." };
  try {
    const saved = await drafts.save(session.user.id, route.scope, route.athleteId, {
      draftId: optionalText(formData.get("draftId")) ?? null,
      expectedVersion: optionalNumber(formData.get("draftVersion")) ?? null,
      payload: prescriptionPayload(formData),
    });
    revalidateHub(route.scope, route.athleteId);
    return { success: true, draftId: saved.id, draftVersion: saved.version, message: "Rascunho salvo. O atleta ainda não vê." };
  } catch (error) {
    if (error instanceof z.ZodError) return { fieldErrors: toFieldErrors(error) };
    if (error instanceof SchoolError) return { message: error.message, conflict: error.status === 409 };
    return { message: "Não foi possível salvar o rascunho agora." };
  }
}

/** SAM-59 — publish or discard a draft from the hub's list. */
export async function publishDraftAction(formData: FormData): Promise<void> {
  if (!isSchoolModuleEnabled()) return;
  const session = await requireOnboardedSession();
  const route = parseRoute(formData);
  const draftId = optionalText(formData.get("draftId"));
  if (!route || !draftId) return;
  try {
    await drafts.publish(session.user.id, route.scope, route.athleteId, draftId);
  } catch (error) {
    // An incomplete draft (no date, no block…) opens in the builder, where the errors show next to the fields.
    if (error instanceof z.ZodError || error instanceof SchoolError) {
      const reason = error instanceof SchoolError ? error.message : Object.entries(toFieldErrors(error)).map(([field, message]) => `${field}: ${message}`).join("; ");
      redirect(`${hubBasePath(route.scope, route.athleteId)}/treinos/novo?rascunho=${encodeURIComponent(draftId)}&erro=${encodeURIComponent(reason)}`);
    }
    throw error;
  }
  revalidateHub(route.scope, route.athleteId);
}

export async function deleteDraftAction(formData: FormData): Promise<void> {
  if (!isSchoolModuleEnabled()) return;
  const session = await requireOnboardedSession();
  const route = parseRoute(formData);
  const draftId = optionalText(formData.get("draftId"));
  if (!route || !draftId) return;
  await drafts.remove(session.user.id, route.scope, route.athleteId, draftId);
  revalidateHub(route.scope, route.athleteId);
}

/** SAM-59 — publish a change to a published prescription (new version; amendment after execution). */
export async function reviseWorkoutAction(_prev: AthleteHubActionState, formData: FormData): Promise<AthleteHubActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();
  const route = parseRoute(formData);
  const assignmentId = optionalText(formData.get("assignmentId"));
  if (!route || !assignmentId) return { message: "Requisição inválida." };
  try {
    await reviseWorkout.execute(session.user.id, route.scope, route.athleteId, assignmentId, {
      expectedVersion: optionalNumber(formData.get("expectedVersion")) ?? 0,
      reason: optionalText(formData.get("reason")) ?? null,
      prescription: { ...prescriptionPayload(formData), scheduledAtLocal: String(formData.get("scheduledAt") ?? "") },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { fieldErrors: toFieldErrors(error) };
    if (error instanceof SchoolError) return { message: error.message, conflict: error.status === 409 };
    return { message: "Não foi possível publicar a alteração agora." };
  }
  revalidateHub(route.scope, route.athleteId);
  revalidatePath(`${hubBasePath(route.scope, route.athleteId)}/treinos/${assignmentId}`);
  return { success: true };
}

// SAM-70 — assessments with protocol and the coach's zone profiles (§18.1, §18.2).

const recordAssessment = new RecordAthleteAssessment(prisma);
const promoteAssessment = new PromoteAthleteAssessment(prisma);
const saveZoneProfile = new SaveZoneProfile(prisma);
const assignZoneProfile = new AssignZoneProfile(prisma);

async function sheetAction(formData: FormData, run: (actorUserId: string, route: NonNullable<ReturnType<typeof parseRoute>>) => Promise<unknown>, failure: string): Promise<AthleteHubActionState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();
  const route = parseRoute(formData);
  if (!route) return { message: "Requisição inválida." };
  try {
    await run(session.user.id, route);
  } catch (error) {
    if (error instanceof z.ZodError) return { fieldErrors: toFieldErrors(error) };
    if (error instanceof SchoolError) return { message: error.message };
    return { message: failure };
  }
  revalidatePath(`${hubBasePath(route.scope, route.athleteId)}/ficha-tecnica`);
  return { success: true };
}

export async function recordAssessmentAction(_prev: AthleteHubActionState, formData: FormData): Promise<AthleteHubActionState> {
  return sheetAction(formData, (actor, route) => recordAssessment.execute(actor, route.scope, route.athleteId, {
    sportType: String(formData.get("sportType") ?? ""),
    environment: optionalText(formData.get("environment")),
    assessedLocalDate: String(formData.get("assessedLocalDate") ?? ""),
    protocol: String(formData.get("protocol") ?? ""),
    protocolCode: optionalText(formData.get("protocolCode")),
    assessorName: optionalText(formData.get("assessorName")),
    reference: String(formData.get("reference") ?? ""),
    resultValue: String(formData.get("resultValue") ?? ""),
    resultUnit: optionalText(formData.get("resultUnit")),
    conditions: optionalText(formData.get("conditions")),
    source: String(formData.get("source") ?? ""),
    sourceDetail: optionalText(formData.get("sourceDetail")),
    limitations: optionalText(formData.get("limitations")),
    nextReviewLocalDate: optionalText(formData.get("nextReviewLocalDate")),
  }), "Não foi possível registrar a avaliação agora.");
}

export async function promoteAssessmentAction(_prev: AthleteHubActionState, formData: FormData): Promise<AthleteHubActionState> {
  return sheetAction(formData, (actor, route) => promoteAssessment.execute(actor, route.scope, route.athleteId, String(formData.get("assessmentId") ?? "")),
    "Não foi possível levar o resultado à ficha agora.");
}

export async function saveZoneProfileAction(_prev: AthleteHubActionState, formData: FormData): Promise<AthleteHubActionState> {
  return sheetAction(formData, (actor) => saveZoneProfile.execute(actor, {
    name: String(formData.get("name") ?? ""),
    family: String(formData.get("family") ?? ""),
    reference: String(formData.get("reference") ?? ""),
    method: String(formData.get("method") ?? ""),
    bounds: boundsFromList(String(formData.get("bounds") ?? ""), String(formData.get("labels") ?? "")),
  }, optionalText(formData.get("profileId"))), "Não foi possível salvar o perfil de zonas agora.");
}

export async function assignZoneProfileAction(_prev: AthleteHubActionState, formData: FormData): Promise<AthleteHubActionState> {
  return sheetAction(formData, (actor, route) => assignZoneProfile.execute(actor, route.scope, route.athleteId,
    String(formData.get("family") ?? "") as ZoneFamily, optionalText(formData.get("versionId")) ?? null), "Não foi possível associar o perfil agora.");
}
