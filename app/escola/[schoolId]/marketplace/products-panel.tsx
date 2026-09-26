"use client";

import { Fragment, useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney } from "@/modules/school/presentation/format";
import {
  grantAudienceAction,
  publishProductAction,
  revokeAudienceAction,
  updatePriceAction,
  updateVisibilityAction,
  type MarketplaceActionState,
} from "./actions";

export type AudienceEntry = {
  athleteId: string;
  name: string;
  email: string | null;
  revoked: boolean;
};

export type ProductRow = {
  id: string;
  title: string;
  sportLabel: string;
  status: string;
  visibility: string;
  priceCents: number | null;
  currency: string | null;
  authorName: string | null;
  /** `updatedAt` ISO string — the optimistic-concurrency token for edits. */
  expectedVersion: string;
  completedPurchases: number;
  pendingPurchases: number;
  activeLicenses: number;
  totalViews: number;
  viewsLast30Days: number;
  netCents: number | null;
  audience: AudienceEntry[];
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  ARCHIVED: "Arquivado",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  DRAFT: "warning",
  PUBLISHED: "success",
  ARCHIVED: "neutral",
};

const VISIBILITY_LABEL: Record<string, string> = {
  PUBLIC: "Público",
  UNLISTED: "Link direto",
  SCHOOL_ONLY: "Só da escola",
  PRIVATE: "Atletas escolhidos",
};

/** Views → purchases. Shown only with enough views for the ratio to mean anything. */
function conversionLabel(product: ProductRow): string {
  if (product.totalViews < 10) return "—";
  return `${((product.completedPurchases / product.totalViews) * 100).toFixed(1)}%`;
}

export function ProductsPanel({ schoolId, products }: { schoolId: string; products: ProductRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (needle && !product.title.toLowerCase().includes(needle)) return false;
      if (statusFilter !== "ALL" && product.status !== statusFilter) return false;
      return true;
    });
  }, [products, query, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar produto…"
          aria-label="Buscar produto"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25 sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {["ALL", "PUBLISHED", "DRAFT", "ARCHIVED"].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              aria-pressed={statusFilter === status}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === status
                  ? "border-white/30 bg-white/10 text-foreground"
                  : "border-white/10 text-foreground/60 hover:border-white/25"
              }`}
            >
              {status === "ALL" ? "Todos" : STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/45">
          Nenhum produto corresponde a este filtro.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-foreground/50">
                <th className="py-3 pr-4 font-medium">Produto</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Quem vê</th>
                <th className="py-3 pr-4 font-medium">Preço</th>
                <th className="py-3 pr-4 text-right font-medium">Visualizações</th>
                <th className="py-3 pr-4 text-right font-medium">Vendas</th>
                <th className="py-3 pr-4 text-right font-medium">Conversão</th>
                <th className="py-3 pr-4 text-right font-medium">Líquido</th>
                <th className="py-3 pr-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visible.map((product) => (
                <Fragment key={product.id}>
                  <tr className="transition-colors hover:bg-white/[0.02]">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{product.title}</p>
                      <p className="text-xs text-foreground/40">
                        {product.sportLabel}
                        {product.authorName ? ` · ${product.authorName}` : ""}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={STATUS_TONE[product.status] ?? "neutral"}>
                        {STATUS_LABEL[product.status] ?? product.status}
                      </StatusBadge>
                    </td>
                    <td className="py-3 pr-4 text-xs text-foreground/60">
                      {VISIBILITY_LABEL[product.visibility] ?? product.visibility}
                      {product.visibility === "PRIVATE" && (
                        <span className="block text-foreground/40">
                          {product.audience.filter((entry) => !entry.revoked).length} atleta(s)
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-foreground/60">
                      {formatMoney(product.priceCents, product.currency)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-foreground/60">
                      {product.totalViews}
                      <span className="block text-xs text-foreground/40">
                        {product.viewsLast30Days} em 30d
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-foreground/60">
                      {product.completedPurchases}
                      {product.pendingPurchases > 0 && (
                        <span className="block text-xs text-amber-400">
                          {product.pendingPurchases} pendente(s)
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-foreground/60">
                      {conversionLabel(product)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-foreground/60">
                      {product.netCents === null ? "—" : formatMoney(product.netCents, product.currency)}
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === product.id ? null : product.id)}
                        aria-expanded={expanded === product.id}
                        className="text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {expanded === product.id ? "Fechar" : "Gerenciar"}
                      </button>
                    </td>
                  </tr>
                  {expanded === product.id && (
                    <tr>
                      <td colSpan={9} className="pb-4">
                        <ProductManager schoolId={schoolId} product={product} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProductManager({ schoolId, product }: { schoolId: string; product: ProductRow }) {
  return (
    <div className="grid gap-4 rounded-2xl border border-white/8 bg-white/[0.03] p-5 lg:grid-cols-3">
      <VisibilityForm schoolId={schoolId} product={product} />
      <PriceForm schoolId={schoolId} product={product} />
      <div className="space-y-3">
        {product.status === "DRAFT" && <PublishForm schoolId={schoolId} product={product} />}
        {product.visibility === "PRIVATE" && <AudienceManager schoolId={schoolId} product={product} />}
      </div>
    </div>
  );
}

function VisibilityForm({ schoolId, product }: { schoolId: string; product: ProductRow }) {
  const [state, formAction] = useActionState<MarketplaceActionState, FormData>(updateVisibilityAction, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="expectedVersion" value={product.expectedVersion} />
      <label htmlFor={`vis-${product.id}`} className="text-xs font-medium text-foreground/70">
        Quem pode ver e comprar
      </label>
      <select
        id={`vis-${product.id}`}
        name="visibility"
        defaultValue={product.visibility}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
      >
        <option value="PUBLIC">Público — aparece no catálogo</option>
        <option value="UNLISTED">Link direto — fora do catálogo</option>
        <option value="SCHOOL_ONLY">Só atletas da escola</option>
        <option value="PRIVATE">Apenas atletas escolhidos</option>
      </select>
      <p className="text-xs text-foreground/45">
        &quot;Apenas atletas escolhidos&quot; libera somente para quem estiver na lista abaixo.
      </p>
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <SubmitButton
        pendingLabel="Salvando…"
        className="glass-button rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        Salvar visibilidade
      </SubmitButton>
    </form>
  );
}

function PriceForm({ schoolId, product }: { schoolId: string; product: ProductRow }) {
  const [state, formAction] = useActionState<MarketplaceActionState, FormData>(updatePriceAction, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="expectedVersion" value={product.expectedVersion} />
      <label htmlFor={`price-${product.id}`} className="text-xs font-medium text-foreground/70">
        Preço (R$)
      </label>
      <input
        id={`price-${product.id}`}
        name="priceBrl"
        type="text"
        inputMode="decimal"
        defaultValue={product.priceCents === null ? "" : (product.priceCents / 100).toFixed(2)}
        placeholder="Vazio = grátis"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
      />
      <p className="text-xs text-foreground/45">Deixe vazio para oferecer gratuitamente.</p>
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <SubmitButton
        pendingLabel="Salvando…"
        className="glass-button rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        Salvar preço
      </SubmitButton>
    </form>
  );
}

function PublishForm({ schoolId, product }: { schoolId: string; product: ProductRow }) {
  const [state, formAction] = useActionState<MarketplaceActionState, FormData>(publishProductAction, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="productId" value={product.id} />
      <p className="text-xs font-medium text-foreground/70">Publicação</p>
      <p className="text-xs text-foreground/45">
        Publicar torna a versão atual comprável conforme a visibilidade escolhida.
      </p>
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
      <SubmitButton
        pendingLabel="Publicando…"
        className="glass-button rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        Publicar
      </SubmitButton>
    </form>
  );
}

function AudienceManager({ schoolId, product }: { schoolId: string; product: ProductRow }) {
  const [grantState, grantForm] = useActionState<MarketplaceActionState, FormData>(grantAudienceAction, {});
  const activeEntries = product.audience.filter((entry) => !entry.revoked);

  return (
    <div className="space-y-3 border-t border-white/8 pt-3">
      <p className="text-xs font-medium text-foreground/70">Atletas com acesso</p>

      <form action={grantForm} className="space-y-2">
        <input type="hidden" name="schoolId" value={schoolId} />
        <input type="hidden" name="productId" value={product.id} />
        <input
          name="email"
          type="email"
          required
          placeholder="email@atleta.com"
          aria-label="E-mail do atleta"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs outline-none focus:border-white/25"
        />
        {grantState.message && <p role="alert" className="text-xs text-destructive">{grantState.message}</p>}
        <SubmitButton
          pendingLabel="Liberando…"
          className="glass-button w-full rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Liberar acesso
        </SubmitButton>
      </form>

      {activeEntries.length === 0 ? (
        <p className="text-xs text-foreground/45">
          Ninguém liberado ainda — nenhum atleta consegue comprar este produto.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {activeEntries.map((entry) => (
            <li key={entry.athleteId} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">{entry.name}</span>
              <RevokeAudienceForm
                schoolId={schoolId}
                productId={product.id}
                athleteId={entry.athleteId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RevokeAudienceForm({
  schoolId,
  productId,
  athleteId,
}: {
  schoolId: string;
  productId: string;
  athleteId: string;
}) {
  const [state, formAction] = useActionState<MarketplaceActionState, FormData>(revokeAudienceAction, {});

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      <SubmitButton
        pendingLabel="…"
        className="text-xs text-foreground/50 underline-offset-4 hover:text-rose-300 hover:underline disabled:opacity-50"
      >
        Remover
      </SubmitButton>
      {state.message && <p role="alert" className="text-xs text-destructive">{state.message}</p>}
    </form>
  );
}
