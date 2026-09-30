"use client";

import { useActionState, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { RYVANO_SPORT_TYPES, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";
import { createSchoolProductAction, type MarketplaceActionState } from "./actions";

/**
 * SAM-9 — starts a product owned by the school, in a centered modal over the
 * marketplace screen itself (architecture/rules/ui.md), so the manager never
 * loses the product list they are working from.
 *
 * Deliberately the same short "basics" step the coach studio's wizard opens
 * with (title / description / modality / duration): the product is created as a
 * DRAFT and everything else — price, visibility, publishing — is then done with
 * the panel's existing per-product forms, so there is no second, divergent
 * editing flow for school-owned products. The rule lives in
 * `createSchoolProductAction` → `CreateTrainingProductDraft`; this component
 * only decides when the dialog is up.
 */
export function NewProductForm({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const [state, formAction] = useActionState<MarketplaceActionState, FormData>(createSchoolProductAction, {});
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // Close on success during render rather than in an effect, which would cascade
  // an extra render. Closing unmounts the form, so the next open starts clean.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground"
      >
        Cadastrar produto
      </button>

      {open && (
        <Modal
          title="Cadastrar produto da escola"
          onClose={() => setOpen(false)}
          returnFocusTo={triggerRef}
          initialFocusTo={titleRef}
        >
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="schoolId" value={schoolId} />

            <p className="theme-panel-neutral rounded-xl border p-3 text-xs">
              O plano será cadastrado em nome de <strong>{schoolName}</strong>. A receita das vendas
              pertence à escola, não a um professor.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="product-title" className="text-sm font-medium">
                Título do plano
              </label>
              <input
                ref={titleRef}
                id="product-title"
                name="title"
                type="text"
                required
                maxLength={200}
                autoComplete="off"
                placeholder="Ex.: Base de 12 semanas para 10km"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="product-description" className="text-sm font-medium">
                Descrição
              </label>
              <textarea
                id="product-description"
                name="description"
                rows={3}
                maxLength={5000}
                placeholder="Para quem é o plano e o que ele entrega."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="product-sport" className="text-sm font-medium">
                  Modalidade
                </label>
                <select
                  id="product-sport"
                  name="sportType"
                  defaultValue=""
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                >
                  <option value="">Não especificar</option>
                  {RYVANO_SPORT_TYPES.map((sport) => (
                    <option key={sport} value={sport}>
                      {getRyvanoSportLabel(sport)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="product-duration" className="text-sm font-medium">
                  Duração (semanas)
                </label>
                <input
                  id="product-duration"
                  name="durationWeeks"
                  type="number"
                  min={1}
                  max={520}
                  inputMode="numeric"
                  placeholder="12"
                  aria-describedby="product-duration-hint"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
                <p id="product-duration-hint" className="text-xs text-foreground/50">
                  Opcional.
                </p>
              </div>
            </div>

            <p className="text-xs text-foreground/50">
              O produto nasce como rascunho. Depois de criar, use <strong>Gerenciar</strong> na lista
              para definir preço, quem pode ver e publicar.
            </p>

            {state.message && (
              <p role="alert" className="text-sm text-destructive">{state.message}</p>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-4 py-2 text-sm text-foreground/60 transition-colors hover:text-foreground"
              >
                Cancelar
              </button>
              {/* "Criar", not "Cadastrar produto": the trigger behind the backdrop
                  keeps that name, and two controls sharing an accessible name are
                  ambiguous for screen readers. */}
              <SubmitButton
                pendingLabel="Criando…"
                className="glass-button rounded-full px-5 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
              >
                Criar
              </SubmitButton>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
