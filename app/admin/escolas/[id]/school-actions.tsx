"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminDeactivateSchoolAction, adminReactivateSchoolAction } from "./actions";

type Status = string;

export function AdminSchoolActions({ schoolId, currentStatus }: { schoolId: string; currentStatus: Status }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  function handleDeactivate() {
    setError(null);
    startTransition(async () => {
      const result = await adminDeactivateSchoolAction(schoolId);
      if (result.error) {
        setError(result.error);
      } else {
        setShowConfirm(false);
        router.refresh();
      }
    });
  }

  function handleReactivate() {
    setError(null);
    startTransition(async () => {
      const result = await adminReactivateSchoolAction(schoolId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  if (currentStatus === "ACTIVE") {
    return (
      <div className="flex flex-col items-end gap-2">
        {showConfirm ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 max-w-xs text-sm space-y-3">
            <p className="font-medium text-destructive">Confirmar desativação?</p>
            <p className="text-foreground/70 text-xs">
              Todos os vínculos ativos (membros, coaches, atletas) serão encerrados. Os atletas poderão migrar para outra escola.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleDeactivate}
                disabled={isPending}
                className="flex-1 rounded-lg bg-destructive text-white text-xs font-semibold px-3 py-2 hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? "Desativando…" : "Confirmar"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-border text-xs font-semibold px-3 py-2 hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            className="rounded-lg border border-destructive/40 text-destructive text-sm font-medium px-4 py-2 hover:bg-destructive/5 transition-colors"
          >
            Desativar escola
          </button>
        )}
      </div>
    );
  }

  if (currentStatus === "INACTIVE") {
    return (
      <div className="flex flex-col items-end gap-2">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          onClick={handleReactivate}
          disabled={isPending}
          className="rounded-lg border border-border text-sm font-medium px-4 py-2 hover:bg-muted transition-colors disabled:opacity-50"
        >
          {isPending ? "Reativando…" : "Reativar escola"}
        </button>
      </div>
    );
  }

  return null;
}
