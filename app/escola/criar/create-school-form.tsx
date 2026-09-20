"use client";

import { useActionState } from "react";
import { createSchoolAction } from "./actions";

export function CreateSchoolForm() {
  const [state, action, isPending] = useActionState(createSchoolAction, {});

  return (
    <form action={action} className="space-y-6">
      {state.message && (
        <p className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {state.message}
        </p>
      )}

      {/* Nome */}
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium">
          Nome da escola <span className="text-destructive">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={200}
          placeholder="Ex: Academia Ryvano"
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Descrição */}
      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-sm font-medium">
          Descrição <span className="text-muted-foreground text-xs">(opcional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={5000}
          placeholder="Descreva a proposta da escola, modalidades, localização…"
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* Política de entrada */}
      <div className="space-y-1.5">
        <label htmlFor="joinPolicy" className="block text-sm font-medium">
          Quem pode entrar?
        </label>
        <select
          id="joinPolicy"
          name="joinPolicy"
          defaultValue="REQUIRE_APPROVAL"
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="REQUIRE_APPROVAL">Somente com aprovação do responsável</option>
          <option value="AUTO_APPROVE">Entrada automática (qualquer pessoa pode entrar)</option>
          <option value="INVITE_ONLY">Somente por convite</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Você pode alterar essa configuração depois nas configurações da escola.
        </p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? "Criando…" : "Criar escola"}
      </button>
    </form>
  );
}
