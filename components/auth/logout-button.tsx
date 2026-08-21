"use client";

import { signOut } from "next-auth/react";

type LogoutButtonProps = {
  className?: string;
  label?: string;
  onClick?: () => void;
};

export function LogoutButton({
  className = "glass-button rounded-full px-4 py-2 text-sm font-semibold text-foreground",
  label = "Sair",
  onClick,
}: LogoutButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        signOut({ callbackUrl: "/" });
      }}
      className={className}
    >
      {label}
    </button>
  );
}
