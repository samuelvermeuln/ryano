"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function GoogleSignInButton({ callbackUrl = "/entrar" }: { callbackUrl?: string }) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setPending(true);
        void signIn("google", { callbackUrl });
      }}
      disabled={pending}
      className="glass-button flex h-[52px] w-full items-center justify-center gap-3 rounded-2xl px-5 py-3 text-sm font-semibold text-foreground"
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-slate-900">
        G
      </span>
      <span className="inline-flex items-center gap-2">
        {pending ? <span className="h-2 w-2 rounded-full bg-current opacity-80" aria-hidden="true" /> : null}
        {pending ? "Conectando com Google..." : "Continuar com Google"}
      </span>
    </button>
  );
}
