"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { useStore } from "zustand";

import {
  createCollectionStore,
  type CollectionState,
  type CollectionStore,
} from "@/lib/stores/collection-store";

/**
 * SAM-15 — Provider + hook tipados para uma store de coleção, no padrão do
 * guia oficial "Zustand + Next.js": a store nasce em `useRef` dentro do
 * Provider (uma por árvore/escopo, nunca global), é semeada com os dados que
 * o Server Component já buscou, e os componentes assinam com selectors.
 *
 * Um Provider por domínio (turmas, atletas…) e por escopo (a escola aberta):
 * ao trocar de escola o layout remonta o Provider e nada da escola anterior
 * sobrevive. Sem `persist`: nada aqui é preferência de UI.
 */
export function createCollectionStoreContext<T extends { id: string }>(displayName: string) {
  const Context = createContext<CollectionStore<T> | null>(null);

  function Provider({
    scope,
    initialItems,
    children,
  }: {
    scope: string;
    initialItems: readonly T[];
    children: ReactNode;
  }) {
    const storeRef = useRef<CollectionStore<T> | null>(null);
    if (storeRef.current === null) {
      // Semeadura no estado inicial: o snapshot de servidor (`getInitialState`)
      // e o primeiro render do cliente têm os mesmos dados — sem hydration
      // mismatch e sem refetch do que o Server Component já buscou.
      storeRef.current = createCollectionStore<T>({ scope, items: initialItems });
    }
    return <Context.Provider value={storeRef.current}>{children}</Context.Provider>;
  }
  Provider.displayName = `${displayName}Provider`;

  function useCollectionStore<R>(selector: (state: CollectionState<T>) => R): R {
    const store = useContext(Context);
    if (!store) throw new Error(`${displayName}: use dentro do ${displayName}Provider.`);
    return useStore(store, selector);
  }

  function useCollectionStoreApi(): CollectionStore<T> {
    const store = useContext(Context);
    if (!store) throw new Error(`${displayName}: use dentro do ${displayName}Provider.`);
    return store;
  }

  return { Provider, useCollectionStore, useCollectionStoreApi };
}
