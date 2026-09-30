"use client";

import { Fragment, useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney } from "@/modules/school/presentation/format";
import {
  grantCoachProductAudienceAction,
  publishCoachProductAction,
  revokeCoachProductAudienceAction,
  updateCoachProductPriceAction,
  updateCoachProductVisibilityAction,
  type CoachMarketplaceActionState,
} from "./actions";

export type SellerAudienceEntry = {
  athleteId: string;
  name: string;
  email: string | null;
  revoked: boolean;
};

export type SellerProductRow = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  priceCents: number | null;
  currency: string | null;
  /** `updatedAt` ISO string — the optimistic-concurrency token for edits. */
  expectedVersion: string;
  completedPurchases: number;
  refundedPurchases: number;
  activeLicenses: number;
  totalViews: number;
  views30d: number;
  conversionPct: number | null;
  netCents: number;
  audience: SellerAudienceEntry[];
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

const SORTS = {
  recent: { label: "Recentes", compare: () => 0 },
  revenue: { label: "Maior receita", compare: (a: SellerProductRow, b: SellerProductRow) => b.netCents - a.netCents },
  sales: { label: "Mais vendidos", compare: (a: SellerProductRow, b: SellerProductRow) => b.completedPurchases - a.completedPurchases },
  views: { label: "Mais vistos", compare: (a: SellerProductRow, b: SellerProductRow) => b.totalViews - a.totalViews },
} as const;

type SortKey = keyof typeof SORTS;

/**
 * A product with real traffic and no sales is the seller's most actionable
 * signal — it points at price or description, not at reach. Below this many
 * views the ratio is noise, so no advice is offered.
 */
const CONVERSION_MIN_VIEWS = 10;

function conversionLabel(row: SellerProductRow): string {
  if (row.conversionPct === null || row.totalViews < CONVERSION_MIN_VIEWS) return "—";
  return `${row.conversionPct.toFixed(1)}%`;
}

export function SellerPanel({ schoolId, products }: { schoolId: string; products: SellerProductRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sort, setSort] = useState<SortKey>("recent");
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = products.filter((product) => {
      if (needle && !product.title.toLowerCase().includes(needle)) return false;
      if (statusFilter !== "ALL" && product.status !== statusFilter) return false;
      return true;
    });
    // `products` arrives already ordered by updatedAt desc, so "recent" keeps
    // the server's order instead of re-sorting by a field the client lacks.
    return sort === "recent" ? filtered : [...filtered].sort(SORTS[sort].compare);
  }, [products, query, statusFilter, sort]);

  const stalled = useMemo(
    () => products.filter((row) => row.totalViews >= CONVERSION_MIN_VIEWS && row.completedPurchases === 0),
    [products],
  );

  return (
    <div className="space-y-4">
      {stalled.length > 0 && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">
            {stalled.length === 1 ? "1 plano tem visitas mas nenhuma venda" : `${stalled.length} planos têm visitas mas nenhuma venda`}
          </p>
          <p className="mt-0.5 text-xs text-amber-200/80">
            {stalled.map((row) => row.title).join(", ")} — quem chegou não comprou, o que aponta para preço ou descrição, não para alcance.
          </p>
        </div>
      )}

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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-foreground/45">Ordenar:</span>
        {(Object.keys(SORTS) as SortKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            aria-pressed={sort === key}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              sort === key ? "bg-white/10 text-foreground" : "text-foreground/55 hover:text-foreground"
            }`}
          >
            {SORTS[key].label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/45">
          Nenhum plano corresponde a este filtro.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-foreground/50">
                <th className="py-3 pr-4 font-medium">Plano</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Quem vê</th>
                <th className="py-3 pr-4 font-medium">Preço</th>
                <th className="py-3 pr-4 text-right font-medium">Acessos</th>
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
                      <Link
                        href={`/professor/estudio/produtos/${product.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {product.title}
                      </Link>
                      <p className="text-xs text-foreground/40">
                        {product.activeLicenses} licença{product.activeLicenses !== 1 ? "s" : ""} ativa{product.activeLicenses !== 1 ? "s" : ""}
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
                      <span className="block text-xs text-foreground/40">{product.views30d} em 30d</span>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-foreground/60">
                      {product.completedPurchases}
                      {product.refundedPurchases > 0 && (
                        <span className="block text-xs text-rose-300">
                          {product.refundedPurchases} reembolsada{product.refundedPurchases !== 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-foreground/60">
                      {conversionLabel(product)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-foreground/60">
                      {formatMoney(product.netCents, product.currency)}
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

function ProductManager({ schoolId, product }: { schoolId: string; product: SellerProductRow }) {
  return (
    <div className="grid gap-4 rounded-2xl border border-white/8 bg-white/[0.03] p-5 lg:grid-cols-3">
      <VisibilityForm schoolId={schoolId} product={product} />
      <PriceForm schoolId={schoolId} product={product} />
      <div className="space-y-3">
        {product.status === "DRAFT" && <PublishForm schoolId={schoolId} product={product} />}
        {product.visibility === "PRIVATE" && <AudienceManager schoolId={schoolId} product={product} />}
        <Link
          href={`/professor/estudio/produtos/${product.id}`}
          className="inline-block text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
        >
          Editar conteúdo e versões →
        </Link>
      </div>
    </div>
  );
}

function VisibilityForm({ schoolId, product }: { schoolId: string; product: SellerProductRow }) {
  const [state, formAction] = useActionState<CoachMarketplaceActionState, FormData>(
    updateCoachProductVisibilityAction,
    {},
  );

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

function PriceForm({ schoolId, product }: { schoolId: string; product: SellerProductRow }) {
  const [state, formAction] = useActionState<CoachMarketplaceActionState, FormData>(
    updateCoachProductPriceAction,
    {},
  );

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
      <p className="text-xs text-foreground/45">
        Alterar o preço não muda o que já foi vendido: cada compra guarda o valor pago.
      </p>
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

function PublishForm({ schoolId, product }: { schoolId: string; product: SellerProductRow }) {
  const [state, formAction] = useActionState<CoachMarketplaceActionState, FormData>(
    publishCoachProductAction,
    {},
  );

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
        Publicar versão
      </SubmitButton>
    </form>
  );
}

function AudienceManager({ schoolId, product }: { schoolId: string; product: SellerProductRow }) {
  const [grantState, grantAction] = useActionState<CoachMarketplaceActionState, FormData>(
    grantCoachProductAudienceAction,
    {},
  );
  const active = product.audience.filter((entry) => !entry.revoked);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground/70">Atletas liberados ({active.length})</p>

      <form action={grantAction} className="space-y-2">
        <input type="hidden" name="schoolId" value={schoolId} />
        <input type="hidden" name="productId" value={product.id} />
        <input
          name="email"
          type="email"
          required
          placeholder="e-mail do atleta"
          aria-label="E-mail do atleta"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
        />
        {grantState.message && <p role="alert" className="text-xs text-destructive">{grantState.message}</p>}
        <SubmitButton
          pendingLabel="Liberando…"
          className="glass-button rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Liberar acesso
        </SubmitButton>
      </form>

      {active.length > 0 && (
        <ul className="space-y-1">
          {active.map((entry) => (
            <li key={entry.athleteId} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-foreground/70">{entry.name}</span>
              <RevokeForm schoolId={schoolId} productId={product.id} athleteId={entry.athleteId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RevokeForm({
  schoolId,
  productId,
  athleteId,
}: {
  schoolId: string;
  productId: string;
  athleteId: string;
}) {
  const [state, formAction] = useActionState<CoachMarketplaceActionState, FormData>(
    revokeCoachProductAudienceAction,
    {},
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="athleteId" value={athleteId} />
      {state.message && <p role="alert" className="sr-only">{state.message}</p>}
      <SubmitButton pendingLabel="…" className="text-xs text-rose-300 hover:underline disabled:opacity-50">
        Remover
      </SubmitButton>
    </form>
  );
}
