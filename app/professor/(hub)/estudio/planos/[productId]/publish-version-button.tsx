"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PublishVersionButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function publish() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/coach/products/${productId}/publish`, { method: "POST" });
      const data = await res.json() as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "Não foi possível publicar este plano.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button" disabled={isPending} onClick={publish}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Publicando…" : "Publicar rascunho"}
      </button>
      {error && <p className="text-xs text-destructive max-w-xs text-right">{error}</p>}
    </div>
  );
}
