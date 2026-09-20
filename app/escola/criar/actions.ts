"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOnboardedSession } from "@/server/auth-guards";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolService } from "@/modules/school/application/school-service";
import { SchoolError } from "@/modules/school/domain/errors";
import { CreateInvitationLink } from "@/modules/school/application/create-invitation-link";
import { InvitationType } from "@/modules/school/domain/enums";
import { encryptSecret } from "@/server/crypto/secret-vault";
import { normalizePhoneToE164 } from "@/server/utils/phone";
import { getHttpClient } from "@/lib/http-client";
import { prisma } from "@/server/db";

export type CreateSchoolState = {
  message?: string;
  fieldErrors?: Record<string, string>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────────────

const schoolDataSchema = z.object({
  // Escola
  schoolName:    z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(200),
  schoolEmail:   z.string().trim().email("E-mail da escola inválido.").max(254),
  schoolPhone:   z.string().trim().min(10, "Telefone inválido."),
  cnpj:          z.string().trim().min(14, "CNPJ inválido. Informe 14 caracteres (letras e números)."),
  description:   z.string().trim().max(5000).optional(),
  // Endereço da escola
  postalCode:    z.string().trim().min(8, "Informe o CEP."),
  addressNumber: z.string().trim().min(1, "Informe o número."),
  complement:    z.string().trim().max(100).optional(),
  // Modalidades
  sportTypes:    z.string().transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  // Política de entrada
  joinPolicy:    z.enum(["AUTO_APPROVE", "REQUIRE_APPROVAL", "INVITE_ONLY"]).default("REQUIRE_APPROVAL"),
  // Professores para convidar (e-mails separados por vírgula, opcional)
  coachEmails:   z.string().optional().transform((v) =>
    (v ?? "").split(/[,\n]/).map((e) => e.trim()).filter((e) => e.length > 0)),
});

// ──────────────────────────────────────────────────────────────────────────────
// ViaCEP helper (shared logic)
// ──────────────────────────────────────────────────────────────────────────────

async function lookupCep(postalCode: string) {
  try {
    const res = await getHttpClient().request<{
      erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string;
    }>({ url: `https://viacep.com.br/ws/${postalCode}/json/` });
    const d = res.data;
    if (res.status < 200 || res.status >= 300 || d.erro || !d.logradouro || !d.localidade || !d.uf) return null;
    return { street: d.logradouro, district: d.bairro ?? "", city: d.localidade, state: d.uf, country: "Brasil" };
  } catch { return null; }
}

/**
 * Normaliza CNPJ tradicional (numérico) e o novo CNPJ alfanumérico (Receita Federal, 2026).
 * Remove pontuação (. / -), converte para maiúsculas e valida 14 chars [A-Z0-9].
 */
function normalizeCnpj(raw: string): string | null {
  const normalized = raw.replace(/[.\-\/\s]/g, "").toUpperCase();
  return normalized.length === 14 && /^[A-Z0-9]{14}$/.test(normalized) ? normalized : null;
}

function hashCnpj(cnpj: string): string {
  return createHash("sha256").update(cnpj).digest("hex");
}

// ──────────────────────────────────────────────────────────────────────────────
// Main action
// ──────────────────────────────────────────────────────────────────────────────

const service = new SchoolService(prisma);
const createInvitation = new CreateInvitationLink(prisma);

export async function createSchoolAction(
  _prev: CreateSchoolState,
  formData: FormData,
): Promise<CreateSchoolState> {
  if (!isSchoolModuleEnabled()) return { message: "Recurso indisponível." };

  const session = await requireOnboardedSession();

  const parsed = schoolDataSchema.safeParse({
    schoolName:    formData.get("schoolName"),
    schoolEmail:   formData.get("schoolEmail"),
    schoolPhone:   formData.get("schoolPhone"),
    cnpj:          formData.get("cnpj"),
    description:   formData.get("description") || undefined,
    postalCode:    formData.get("postalCode"),
    addressNumber: formData.get("addressNumber"),
    complement:    formData.get("complement") || undefined,
    sportTypes:    formData.get("sportTypes") ?? "",
    joinPolicy:    formData.get("joinPolicy") || undefined,
    coachEmails:   formData.get("coachEmails") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { schoolName, schoolEmail, schoolPhone, cnpj, description, postalCode,
          addressNumber, complement, sportTypes, joinPolicy, coachEmails } = parsed.data;

  // Validate CNPJ digits
  const cnpjDigits = normalizeCnpj(cnpj);
  if (!cnpjDigits) return { fieldErrors: { cnpj: "CNPJ inválido. Informe 14 caracteres (letras e números)." } };

  // Normalize phone
  const phoneE164 = normalizePhoneToE164(schoolPhone);
  if (!phoneE164) return { fieldErrors: { schoolPhone: "Telefone inválido." } };

  // Validate sportTypes
  if (sportTypes.length === 0) return { fieldErrors: { sportTypes: "Selecione ao menos uma modalidade." } };

  // Validate coach emails
  const emailSchema = z.email();
  const invalidEmail = coachEmails.find((e) => !emailSchema.safeParse(e).success);
  if (invalidEmail) return { fieldErrors: { coachEmails: `E-mail inválido: ${invalidEmail}` } };

  // Lookup CEP
  const cep = postalCode.replace(/\D/g, "");
  if (cep.length !== 8) return { fieldErrors: { postalCode: "CEP inválido." } };
  const address = await lookupCep(cep);
  if (!address) return { fieldErrors: { postalCode: "CEP não encontrado. Confira os números." } };

  // Encrypt CNPJ
  const cnpjEncrypted = JSON.stringify(encryptSecret(cnpjDigits));
  const cnpjHash = hashCnpj(cnpjDigits);

  let schoolId: string;
  try {
    const school = await service.create(session.user.id, {
      name:          schoolName,
      email:         schoolEmail,
      phoneE164,
      cnpjEncrypted,
      cnpjHash,
      description,
      joinPolicy,
      sportTypes,
      postalCode:    cep,
      street:        address.street,
      addressNumber,
      complement,
      district:      address.district,
      city:          address.city,
      state:         address.state,
      country:       address.country,
    });
    schoolId = school.id;
  } catch (error) {
    if (error instanceof SchoolError) {
      if (error.code === "SCHOOL_SLUG_TAKEN") return { fieldErrors: { schoolName: error.message } };
      return { message: error.message };
    }
    return { message: "Não foi possível criar a escola agora. Tente novamente." };
  }

  // Criar convites para professores e registrar e-mail do destinatário no audit log.
  // Erros não bloqueiam — escola já foi criada; re-envio possível pelo painel de convites.
  for (const email of coachEmails) {
    try {
      const { invitation } = await createInvitation.execute(session.user.id, {
        type: InvitationType.SCHOOL_COACH,
        schoolId,
        requiresApproval: false,
        maxUses: 1,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      // Registra e-mail do convidado para auditoria (sem referenciar o token bruto)
      await prisma.adminAuditLog.create({
        data: {
          actorUserId: session.user.id,
          action: "SCHOOL_COACH_INVITE_SENT",
          entityType: "INVITATION_LINK",
          entityId: invitation.id,
          metadata: { inviteeEmail: email, schoolId },
        },
      }).catch(() => undefined);
    } catch {
      // Silencioso — convite pode ser reenviado pelo painel
    }
  }

  redirect(`/escola/${schoolId}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// CEP lookup para o client (chamada AJAX no wizard)
// ──────────────────────────────────────────────────────────────────────────────

export type CepLookupResult =
  | { ok: true; street: string; district: string; city: string; state: string }
  | { ok: false; message: string };

export async function lookupCepAction(postalCode: string): Promise<CepLookupResult> {
  const cep = postalCode.replace(/\D/g, "");
  if (cep.length !== 8) return { ok: false, message: "CEP inválido." };
  const result = await lookupCep(cep);
  if (!result) return { ok: false, message: "CEP não encontrado." };
  return { ok: true, ...result };
}
