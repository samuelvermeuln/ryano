import { z } from "zod";

export const onboardingAccountSchema = z.object({
  name: z.string().trim().min(3, "Informe nome completo."),
});

export const onboardingProfileSchema = z.object({
  cpf: z.string().trim().min(11, "Informe CPF válido."),
  phone: z.string().trim().min(10, "Informe telefone válido."),
  heightCm: z.coerce.number().int().min(50, "Altura inválida.").max(280, "Altura inválida."),
  weightKg: z.coerce.number().min(20, "Peso inválido.").max(500, "Peso inválido."),
  postalCode: z.string().trim().min(8, "Informe CEP."),
  number: z.string().trim().min(1, "Informe número."),
  complement: z.string().trim().optional().or(z.literal("")),
});

export const profileDetailsSchema = z.object({
  name: z.string().trim().min(3, "Informe nome completo."),
  heightCm: z.coerce.number().int().min(50, "Altura inválida.").max(280, "Altura inválida."),
  weightKg: z.coerce.number().min(20, "Peso inválido.").max(500, "Peso inválido."),
  postalCode: z.string().trim().min(8, "Informe CEP."),
  number: z.string().trim().min(1, "Informe número."),
  complement: z.string().trim().optional().or(z.literal("")),
});

export const adminUserIdentitySchema = z.object({
  cpf: z.string().trim().min(11, "Informe CPF válido."),
  phone: z.string().trim().min(10, "Informe telefone válido."),
});

export const profilePreferencesSchema = z.object({
  postActivityReport: z.boolean(),
  dailySummary: z.boolean(),
  weeklySummary: z.boolean(),
  enabled: z.boolean(),
  reportTime: z.string().trim().optional(),
  timezone: z.string().trim().min(3, "Informe timezone."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe senha atual."),
    password: z
      .string()
      .min(8, "Senha precisa ter pelo menos 8 caracteres.")
      .regex(/[A-Za-z]/, "Senha precisa conter letra.")
      .regex(/[0-9]/, "Senha precisa conter número."),
    confirmPassword: z.string().min(8, "Confirme senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Senhas não conferem.",
    path: ["confirmPassword"],
  });
