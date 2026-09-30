import { createStore, type StoreApi } from "zustand";

/**
 * SAM-15 — store de coleção (Zustand) por domínio, com cache curto e
 * deduplicação de requests. Segue o guia oficial do Zustand para Next.js App
 * Router: a store é criada por `createStore` (vanilla) dentro de um Provider
 * React (ver `createCollectionStoreContext`), nunca como singleton de módulo —
 * no servidor um módulo é compartilhado entre requests/usuários.
 *
 * Princípio: a store é estado de cliente, não fonte de verdade. O servidor
 * (DB → use cases → Server Components/Actions) continua mandando; aqui só fica
 * a cópia "quente" usada entre interações, com freshness explícita.
 *
 * Chaves de escopo (`scope`) isolam tenants: `athletes:${schoolId}`; trocar
 * de escola nunca mostra a lista da anterior porque a chave muda.
 */
export type CollectionMeta = {
  updatedAt: number | null;
  loading: boolean;
  error: string | null;
};

export type CollectionState<T extends { id: string }> = {
  byId: Record<string, T>;
  idsByScope: Record<string, string[]>;
  metaByScope: Record<string, CollectionMeta>;

  /** Semeia um escopo com dados que o servidor já entregou (SSR → sem refetch após hidratar). */
  hydrate: (scope: string, items: readonly T[], at?: number) => void;
  /**
   * get-or-fetch: devolve o cache se ainda fresco (`ttlMs`), senão busca.
   * Chamadas simultâneas para o mesmo escopo compartilham a mesma promise.
   */
  ensure: (scope: string, fetcher: () => Promise<readonly T[]>, options?: { ttlMs?: number; force?: boolean }) => Promise<T[]>;
  upsert: (scope: string, item: T, position?: "start" | "end") => void;
  remove: (scope: string, id: string) => void;
  /** Marca o escopo como obsoleto: a próxima `ensure` busca de novo; os dados continuam visíveis até lá. */
  invalidate: (scope: string) => void;
  clear: () => void;
};

const EMPTY_META: CollectionMeta = { updatedAt: null, loading: false, error: null };
const EMPTY_IDS: string[] = [];

export type CollectionStore<T extends { id: string }> = StoreApi<CollectionState<T>>;

export type CollectionSeed<T extends { id: string }> = { scope: string; items: readonly T[] };

/**
 * `seed` entra no ESTADO INICIAL da store, não num `hydrate()` posterior:
 * `useStore` usa `getInitialState()` como snapshot do servidor, então dados
 * aplicados depois da criação renderizariam vazio no SSR e cheio no cliente
 * (hydration mismatch + flash).
 */
export function createCollectionStore<T extends { id: string }>(
  seed?: CollectionSeed<T>,
  now: () => number = () => Date.now(),
): CollectionStore<T> {
  // Requests em voo por escopo. Fora do estado: não é dado renderizável.
  const inFlight = new Map<string, Promise<T[]>>();
  const seeded = seed
    ? {
        byId: Object.fromEntries(seed.items.map((item) => [item.id, item])) as Record<string, T>,
        idsByScope: { [seed.scope]: seed.items.map((item) => item.id) },
        metaByScope: { [seed.scope]: { updatedAt: now(), loading: false, error: null } },
      }
    : { byId: {} as Record<string, T>, idsByScope: {}, metaByScope: {} };

  return createStore<CollectionState<T>>()((set, get) => ({
    ...seeded,

    hydrate: (scope, items, at = now()) => {
      set((state) => ({
        byId: { ...state.byId, ...Object.fromEntries(items.map((item) => [item.id, item])) },
        idsByScope: { ...state.idsByScope, [scope]: items.map((item) => item.id) },
        metaByScope: { ...state.metaByScope, [scope]: { updatedAt: at, loading: false, error: null } },
      }));
    },

    ensure: async (scope, fetcher, options = {}) => {
      const { ttlMs = 30_000, force = false } = options;
      const state = get();
      const meta = state.metaByScope[scope] ?? EMPTY_META;
      const cached = state.idsByScope[scope];

      if (!force && cached && meta.updatedAt !== null && now() - meta.updatedAt < ttlMs) {
        return cached.map((id) => state.byId[id]).filter(Boolean);
      }

      const pending = inFlight.get(scope);
      if (pending) return pending;

      set((current) => ({
        metaByScope: { ...current.metaByScope, [scope]: { ...(current.metaByScope[scope] ?? EMPTY_META), loading: true, error: null } },
      }));

      const request = fetcher()
        .then((items) => {
          get().hydrate(scope, items);
          return [...items];
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Falha ao carregar.";
          set((current) => ({
            metaByScope: { ...current.metaByScope, [scope]: { ...(current.metaByScope[scope] ?? EMPTY_META), loading: false, error: message } },
          }));
          throw error;
        })
        .finally(() => {
          inFlight.delete(scope);
        });

      inFlight.set(scope, request);
      return request;
    },

    upsert: (scope, item, position = "end") => {
      set((state) => {
        const ids = state.idsByScope[scope] ?? EMPTY_IDS;
        const exists = ids.includes(item.id);
        const nextIds = exists ? ids : position === "start" ? [item.id, ...ids] : [...ids, item.id];
        return {
          byId: { ...state.byId, [item.id]: item },
          idsByScope: { ...state.idsByScope, [scope]: nextIds },
        };
      });
    },

    remove: (scope, id) => {
      set((state) => {
        const ids = state.idsByScope[scope] ?? EMPTY_IDS;
        if (!ids.includes(id)) return state;
        const rest = { ...state.byId };
        delete rest[id];
        return { byId: rest, idsByScope: { ...state.idsByScope, [scope]: ids.filter((other) => other !== id) } };
      });
    },

    invalidate: (scope) => {
      set((state) => ({
        metaByScope: { ...state.metaByScope, [scope]: { ...(state.metaByScope[scope] ?? EMPTY_META), updatedAt: null } },
      }));
    },

    clear: () => {
      inFlight.clear();
      set({ byId: {}, idsByScope: {}, metaByScope: {} });
    },
  }));
}

/** Selector de lista por escopo. Devolve sempre a mesma referência enquanto nada muda (ids e byId). */
export function selectCollection<T extends { id: string }>(scope: string) {
  let lastIds: string[] | undefined;
  let lastById: Record<string, T> | undefined;
  let lastResult: T[] = [];
  return (state: CollectionState<T>): T[] => {
    const ids = state.idsByScope[scope] ?? EMPTY_IDS;
    if (ids === lastIds && state.byId === lastById) return lastResult;
    lastIds = ids;
    lastById = state.byId;
    lastResult = ids.map((id) => state.byId[id]).filter((item): item is T => item !== undefined);
    return lastResult;
  };
}

export function selectMeta<T extends { id: string }>(scope: string) {
  return (state: CollectionState<T>): CollectionMeta => state.metaByScope[scope] ?? EMPTY_META;
}
