"use client";

/**
 * SAM-74 — "Importar arquivo" (§18.3): no watch or integration required. A
 * file that cannot be read shows why and offers the manual record instead;
 * the same bytes imported twice open the existing activity.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { PRIMARY_ACTION_CLASS } from "@/components/page-header";

type Result = { activityId: string; duplicate: boolean; format: string; matchStatus: string | null };

export function ImportActivityButton() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; activityId?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2" data-testid="import-activity">
      <input
        ref={input}
        type="file"
        accept=".fit,.gpx,.tcx"
        className="sr-only"
        aria-label="Arquivo de atividade (FIT, GPX ou TCX)"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setMessage(null);
          startTransition(async () => {
            const body = new FormData();
            body.append("file", file);
            const response = await fetch("/api/activities/import", { method: "POST", body });
            const payload = (await response.json().catch(() => null)) as (Result & { message?: string }) | null;
            if (!response.ok || !payload?.activityId) {
              setMessage({ tone: "error", text: payload?.message ?? "Não foi possível importar o arquivo." });
              return;
            }
            setMessage({ tone: "ok", text: payload.duplicate ? "Este arquivo já tinha sido importado — abrindo a atividade existente." : `Arquivo ${payload.format} importado${payload.matchStatus ? " e associado a uma prescrição" : ""}.`, activityId: payload.activityId });
            router.refresh();
          });
          event.target.value = "";
        }}
      />
      <button type="button" className={PRIMARY_ACTION_CLASS} disabled={pending} onClick={() => input.current?.click()}>
        {pending ? "Importando..." : "Importar arquivo"}
      </button>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-xs ${message.tone === "error" ? "text-rose-400" : "text-emerald-500"}`} data-testid="import-result">
          {message.text}{" "}
          {message.activityId && <Link href={`/app/atividades/${message.activityId}`} className="underline">Abrir atividade</Link>}
          {message.tone === "error" && <Link href="/app/treinos" className="underline">Registrar manualmente</Link>}
        </p>
      )}
    </div>
  );
}
