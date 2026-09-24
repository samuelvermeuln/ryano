"use client";

import { useState, useTransition } from "react";

type Initial = {
  title: string;
  description: string | null;
  sportType: string | null;
  durationWeeks: number | null;
  visibility: string;
  priceCents: number | null;
  currency: string | null;
};

export function ProductEditorPanel({
  productId,
  expectedVersion: initialExpectedVersion,
  initial,
}: {
  productId: string;
  expectedVersion: string;
  initial: Initial;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expectedVersion, setExpectedVersion] = useState(initialExpectedVersion);

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [durationWeeks, setDurationWeeks] = useState(initial.durationWeeks?.toString() ?? "");
  const [visibility, setVisibility] = useState(initial.visibility);
  const [priceCents, setPriceCents] = useState(initial.priceCents !== null ? (initial.priceCents / 100).toString() : "");
  const [currency, setCurrency] = useState(initial.currency ?? "BRL");
  const [isFree, setIsFree] = useState(initial.priceCents === null);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fetch(`/api/coach/products/${productId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: {
            expectedVersion,
            title,
            description: description.trim() || null,
            durationWeeks: durationWeeks ? Number(durationWeeks) : null,
            visibility,
            priceCents: isFree ? null : Math.round(Number(priceCents || "0") * 100),
            currency: isFree ? null : currency,
          },
        }),
      });
      const data = await res.json() as { product?: { updatedAt?: string }; message?: string };
      if (!res.ok) {
        setError(res.status === 409
          ? "Este produto foi alterado em outra sessão. Recarregue a página para ver a versão mais recente."
          : (data.message ?? "Não foi possível salvar."));
        return;
      }
      if (data.product?.updatedAt) setExpectedVersion(data.product.updatedAt);
      setSaved(true);
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-4">
      <h2 className="text-base font-semibold">Detalhes e preço</h2>

      <div className="space-y-1.5">
        <label htmlFor="edit-title" className="text-sm font-medium block">Título</label>
        <input
          id="edit-title" value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="edit-description" className="text-sm font-medium block">Descrição</label>
        <textarea
          id="edit-description" rows={3} value={description}
          onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="edit-duration" className="text-sm font-medium block">Duração (semanas)</label>
          <input
            id="edit-duration" type="number" min={1} max={520} value={durationWeeks}
            onChange={(e) => { setDurationWeeks(e.target.value); setSaved(false); }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="edit-visibility" className="text-sm font-medium block">Visibilidade</label>
          <select
            id="edit-visibility" value={visibility}
            onChange={(e) => { setVisibility(e.target.value); setSaved(false); }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="PUBLIC">Público (aparece na busca)</option>
            <option value="UNLISTED">Não listado (só por link direto)</option>
            <option value="SCHOOL_ONLY">Somente da escola</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium block">Preço</label>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isFree} onChange={(e) => { setIsFree(e.target.checked); setSaved(false); }} />
            Plano gratuito
          </label>
          {!isFree && (
            <div className="flex items-center gap-2">
              <select
                value={currency} onChange={(e) => { setCurrency(e.target.value); setSaved(false); }}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                aria-label="Moeda"
              >
                <option value="BRL">BRL</option>
                <option value="USD">USD</option>
              </select>
              <input
                type="number" min={0.01} step={0.01} value={priceCents}
                onChange={(e) => { setPriceCents(e.target.value); setSaved(false); }}
                placeholder="0,00" aria-label="Preço"
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="text-sm text-foreground/70">Salvo.</p>}

      <button
        type="button" disabled={isPending || title.trim().length === 0} onClick={save}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Salvando…" : "Salvar alterações"}
      </button>
    </section>
  );
}
