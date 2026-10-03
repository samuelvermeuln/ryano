"use client";

/**
 * SAM-75 — the coach chains this session with other sessions of the same
 * athlete (same day, or separate with the link) as a brick.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { SECONDARY_ACTION_CLASS } from "@/components/page-header";

export function BrickLinkForm({ assignmentId, others }: { assignmentId: string; others: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2 text-sm"
      data-testid="brick-link"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const response = await fetch("/api/bricks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignmentIds: [assignmentId, ...selected] }) });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) { setMessage(payload?.message ?? "Não foi possível encadear."); return; }
          setMessage("Sessões encadeadas como brick.");
          router.refresh();
        });
      }}
    >
      <p className="text-xs text-foreground/60">Encadear como brick com:</p>
      {others.map((other) => (
        <label key={other.id} className="flex items-center gap-2">
          <input type="checkbox" checked={selected.includes(other.id)} onChange={(event) => setSelected((current) => (event.target.checked ? [...current, other.id] : current.filter((id) => id !== other.id)))} />
          {other.title}
        </label>
      ))}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending || selected.length === 0} className={SECONDARY_ACTION_CLASS}>Encadear</button>
        {message && <span role="status" className="text-xs">{message}</span>}
      </div>
    </form>
  );
}
