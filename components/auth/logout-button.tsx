"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="glass-button rounded-full px-4 py-2 text-sm font-semibold text-foreground"
    >
      Sair
    </button>
  );
}
