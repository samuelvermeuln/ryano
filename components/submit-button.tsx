"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
  disabled?: boolean;
  /**
   * Submitted as a form field when this specific button is the one pressed,
   * which is how one form can offer several decisions (approve / decline)
   * without duplicating its hidden inputs into separate forms.
   */
  name?: string;
  value?: string;
};

export function SubmitButton({
  children,
  className = "",
  pendingLabel = "Enviando...",
  disabled = false,
  name,
  value,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
