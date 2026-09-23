import { z } from "zod";
import { CoachSelectionPolicy, SchoolJoinPolicy, SchoolStatus } from "./enums";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const schoolInputSchema = z.strictObject({
  id: opaqueId,
  ownerUserId: opaqueId,
  name: z.string().trim().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(5000).optional(),
  logoUrl: z.url().optional(),
  joinPolicy: z.enum(SchoolJoinPolicy).optional(),
  coachSelectionPolicy: z.enum(CoachSelectionPolicy).optional(),
  // Dados cadastrais
  email: z.email().max(254).optional(),
  phoneE164: z.string().regex(/^\+\d{8,15}$/).optional(),
  cnpjEncrypted: z.string().optional(),
  cnpjHash: z.string().max(64).optional(),
  // Endereço
  postalCode: z.string().max(10).optional(),
  street: z.string().max(300).optional(),
  addressNumber: z.string().max(20).optional(),
  complement: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  country: z.string().max(60).optional(),
  // Modalidades
  sportTypes: z.array(z.string().min(1).max(100)).default([]),
});

export const newSchoolSchema = schoolInputSchema.omit({ id: true });
export const createSchoolDtoSchema = newSchoolSchema.omit({ ownerUserId: true }).extend({
  slug: schoolInputSchema.shape.slug.optional(),
});

export interface School {
  id: string;
  slug: string;
  name: string;
  ownerUserId: string;
  description: string | null;
  logoUrl: string | null;
  status: SchoolStatus;
  joinPolicy: SchoolJoinPolicy;
  coachSelectionPolicy: CoachSelectionPolicy;
  // Dados cadastrais
  email: string | null;
  phoneE164: string | null;
  cnpjEncrypted: string | null;
  cnpjHash: string | null;
  // Endereço
  postalCode: string | null;
  street: string | null;
  addressNumber: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  // Modalidades
  sportTypes: string[];
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
  archivedAt: Date | null;
}

export interface CreateSchoolInput {
  id: string;
  slug: string;
  name: string;
  ownerUserId: string;
  description?: string;
  logoUrl?: string;
  joinPolicy?: SchoolJoinPolicy;
  coachSelectionPolicy?: CoachSelectionPolicy;
  email?: string;
  phoneE164?: string;
  cnpjEncrypted?: string;
  cnpjHash?: string;
  postalCode?: string;
  street?: string;
  addressNumber?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  country?: string;
  sportTypes?: string[];
}

export function createSchool(raw: CreateSchoolInput, now: Date): School {
  const input = schoolInputSchema.parse(raw);
  const { id, ...data } = input;
  return { id, ...createSchoolDraft(data, now) };
}

export function createSchoolDraft(raw: Omit<CreateSchoolInput, "id">, now: Date): Omit<School, "id"> {
  const input = newSchoolSchema.parse(raw);
  z.date().parse(now);
  return {
    ...input,
    name: input.name.trim(),
    description: input.description ?? null,
    logoUrl: input.logoUrl ?? null,
    status: SchoolStatus.ACTIVE,
    joinPolicy: input.joinPolicy ?? SchoolJoinPolicy.REQUIRE_APPROVAL,
    coachSelectionPolicy: input.coachSelectionPolicy ?? CoachSelectionPolicy.ADMIN_ASSIGNS,
    email: input.email ?? null,
    phoneE164: input.phoneE164 ?? null,
    cnpjEncrypted: input.cnpjEncrypted ?? null,
    cnpjHash: input.cnpjHash ?? null,
    postalCode: input.postalCode ?? null,
    street: input.street ?? null,
    addressNumber: input.addressNumber ?? null,
    complement: input.complement ?? null,
    district: input.district ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    country: input.country ?? null,
    sportTypes: input.sportTypes ?? [],
    createdAt: new Date(now),
    updatedAt: new Date(now),
    deactivatedAt: null,
    archivedAt: null,
  };
}
