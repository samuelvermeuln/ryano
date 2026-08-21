import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome."),
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Senha precisa ter pelo menos 8 caracteres.")
    .regex(/[A-Za-z]/, "Senha precisa conter letra.")
    .regex(/[0-9]/, "Senha precisa conter número."),
});

export const loginSchema = z.object({
  email: z.email("Informe email válido.").trim().toLowerCase(),
  password: z.string().min(1, "Informe senha."),
});

export const requestPasswordResetSchema = z.object({
  email: z.email("Informe email válido.").trim().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token inválido."),
  password: z
    .string()
    .min(8, "Senha precisa ter pelo menos 8 caracteres.")
    .regex(/[A-Za-z]/, "Senha precisa conter letra.")
    .regex(/[0-9]/, "Senha precisa conter número."),
});
