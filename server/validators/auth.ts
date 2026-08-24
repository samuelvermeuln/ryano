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
  identifier: z.string().trim().min(1, "Informe seu e-mail ou telefone."),
});

export const resetPasswordSchema = z
  .object({
    identifier: z.string().trim().min(1, "Informe seu e-mail ou telefone."),
    code: z.string().trim().regex(/^\d{6}$/, "Digite o código de 6 números."),
    password: z
      .string()
      .min(8, "Senha precisa ter pelo menos 8 caracteres.")
      .regex(/[A-Za-z]/, "Senha precisa conter letra.")
      .regex(/[0-9]/, "Senha precisa conter número."),
    passwordConfirmation: z.string().min(1, "Confirme sua nova senha."),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "As senhas não coincidem.",
    path: ["passwordConfirmation"],
  });

export const resetPasswordLinkSchema = z.object({
  token: z.string().min(1, "Token inválido."),
  password: z
    .string()
    .min(8, "Senha precisa ter pelo menos 8 caracteres.")
    .regex(/[A-Za-z]/, "Senha precisa conter letra.")
    .regex(/[0-9]/, "Senha precisa conter número."),
});
