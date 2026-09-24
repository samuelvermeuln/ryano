"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type Props = {
  productId: string;
  isFree: boolean;
};

/**
 * TM037 (RF-107/RF-108) — the authenticated "acquire" action. Only rendered
 * when the visitor already has a session AND no existing license (the
 * parent page — a Server Component — decides between this, the "Abrir meu
 * plano" link, and the login CTA, since it already knows session/license
 * state server-side; this component never re-derives authorization).
 *
 * Idempotent by construction: `idempotencyKeyRef` is generated once per
 * mount and reused on every retry within this page view, so a flaky
 * connection retried by the user (or an accidental double click) reaches
 * `POST /api/marketplace/checkout` (TM039) with the same key both times —
 * that route's own idempotency (RF-203) turns a duplicate into a no-op,
 * never a second purchase/license.
 */
export function PurchaseCta({ productId, isFree }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<"free" | "paid" | null>(null);
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${productId}-${Date.now()}`,
  );

  async function handleAcquire() {
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/marketplace/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, idempotencyKey: idempotencyKeyRef.current }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus("error");
        setMessage(body?.message ?? "Não foi possível concluir agora. Tente novamente.");
        return;
      }
      // TM062/TM063 — a paid product redirects straight to Stripe's hosted
      // page; the server already revalidated price/version (RF-201) before
      // returning this URL, so there is nothing left to confirm client-side.
      // Stripe itself redirects back to our checkout status page afterward.
      if (body?.kind === "paid" && typeof body?.checkoutUrl === "string" && body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }
      setKind(body?.kind === "paid" ? "paid" : "free");
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Falha de conexão. Você pode tentar de novo sem risco de duplicar a compra.");
    }
  }

  if (status === "done") {
    return (
      <div className="theme-panel-success space-y-2 rounded-2xl border p-4 text-sm">
        <p>
          {kind === "free"
            ? "Plano adicionado à sua conta."
            : "Compra registrada — aguardando confirmação de pagamento."}
        </p>
        <Link href="/app/planos" className="font-medium text-accent hover:underline">
          Ver meus planos
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleAcquire}
        disabled={status === "loading"}
        className="glass-button-primary w-full rounded-2xl px-5 py-3.5 text-sm font-semibold disabled:opacity-60"
      >
        {status === "loading" ? "Processando…" : isFree ? "Adquirir grátis" : "Comprar plano"}
      </button>
      {status === "error" && message ? (
        <p role="alert" className="text-xs text-rose-300">{message}</p>
      ) : null}
    </div>
  );
}
