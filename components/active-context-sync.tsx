"use client";

import { useEffect } from "react";

import { rememberActiveContextAction } from "@/app/actions/user-context";

/**
 * SAM-14 — mantém o cookie de contexto igual ao contexto que o servidor
 * acabou de renderizar. Cookies não podem ser gravados durante a renderização
 * de um Server Component, então o layout passa a chave resolvida e este
 * componente a persiste via Server Action quando ela difere da salva.
 *
 * Não é autorização: a action revalida a chave contra os contextos reais do
 * usuário antes de gravar.
 */
export function ActiveContextSync({ contextKey, savedKey }: { contextKey: string; savedKey: string | null }) {
  useEffect(() => {
    if (contextKey === savedKey) return;
    void rememberActiveContextAction(contextKey);
  }, [contextKey, savedKey]);

  return null;
}
