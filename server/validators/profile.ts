import { z } from "zod";

export const onboardingSchema = z.object({
  name: z.string().trim().min(3, "Informe nome completo."),
  cpf: z.string().trim().min(11, "Informe CPF válido."),
  phone: z.string().trim().min(10, "Informe telefone válido."),
  heightCm: z.coerce.number().int().min(50, "Altura inválida.").max(280, "Altura inválida."),
  weightKg: z.coerce.number().min(20, "Peso inválido.").max(500, "Peso inválido."),
  postalCode: z.string().trim().min(8, "Informe CEP."),
  street: z.string().trim().min(3, "Informe logradouro."),
  number: z.string().trim().min(1, "Informe número."),
  complement: z.string().trim().optional().or(z.literal("")),
  district: z.string().trim().min(2, "Informe bairro."),
  city: z.string().trim().min(2, "Informe cidade."),
  state: z.string().trim().min(2, "Informe UF."),
  country: z.string().trim().min(2, "Informe país."),
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
