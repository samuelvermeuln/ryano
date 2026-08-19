"use client";

import { signIn } from "next-auth/react";

export function GoogleSignInButton({ callbackUrl = "/app/dashboard" }: { callbackUrl?: string }) {
  return (
    <button
      type="button"
      onClick={() => signIn("google", { callbackUrl })}
      className="glass-button w-full rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
    >
      Continuar com Google
    </button>
  );
}
