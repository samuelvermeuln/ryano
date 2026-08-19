import { createHash } from "node:crypto";

export function normalizeCpf(input: string) {
  const digits = input.replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

export function hashCpf(cpf: string) {
  return createHash("sha256").update(cpf).digest("hex");
}
