"use client";

import { useMemo } from "react";

import { createCollectionStoreContext } from "@/lib/stores/collection-store-context";
import { selectCollection } from "@/lib/stores/collection-store";
import { teamsScope } from "./teams-scope";

/**
 * SAM-15 (piloto) — store das turmas de UMA escola. O escopo é `teams:<schoolId>`;
 * o Provider vive na página de turmas, semeado pelo Server Component.
 */
export type TeamRow = {
  id: string;
  name: string;
  sportType: string | null;
  level: string | null;
  location: string | null;
  notes: string | null;
  capacity: number | null;
  athleteCount: number;
  coachCount: number;
  coachNames: string[];
};

export { teamsScope } from "./teams-scope";

const context = createCollectionStoreContext<TeamRow>("TeamsStore");

export const TeamsStoreProvider = context.Provider;
export const useTeamsStore = context.useCollectionStore;
export const useTeamsStoreApi = context.useCollectionStoreApi;

export function useTeams(schoolId: string): TeamRow[] {
  // Selector estável por escopo: `useSyncExternalStore` exige snapshot com a
  // mesma referência enquanto nada muda (o memo vive dentro do selector).
  const selector = useMemo(() => selectCollection<TeamRow>(teamsScope(schoolId)), [schoolId]);
  return useTeamsStore(selector);
}
