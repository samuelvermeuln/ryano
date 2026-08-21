"use client";

import { forwardRef, useId, useState, type ReactNode } from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";

type PasswordFieldProps = {
  name: string;
  label: string;
  placeholder: string;
  autoComplete: "current-password" | "new-password";
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  helperText?: string;
  error?: string;
  trailingLabel?: ReactNode;
};

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  {
    name,
    label,
    placeholder,
    autoComplete,
    value,
    onChange,
    required,
    autoFocus,
    helperText,
    error,
    trailingLabel,
  },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const helperId = useId();
  const errorId = useId();

  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between gap-3 text-[13px] font-medium text-foreground/76 sm:text-sm">
        <span>{label}</span>
        {trailingLabel ? <span className="text-xs font-medium text-foreground/60 sm:text-sm">{trailingLabel}</span> : null}
      </span>

      <div className="glass-input relative rounded-2xl px-4 py-3">
        <input
          ref={ref}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full bg-transparent pr-12 text-[16px] text-foreground outline-none placeholder:text-foreground/40 sm:text-sm"
          required={required}
          autoFocus={autoFocus}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-foreground/56 transition hover:text-foreground"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <IconEyeOff size={18} stroke={1.9} aria-hidden="true" /> : <IconEye size={18} stroke={1.9} aria-hidden="true" />}
        </button>
      </div>

      {error ? (
        <p id={errorId} className="text-xs text-rose-200">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-xs text-foreground/58">
          {helperText}
        </p>
      ) : null}
    </label>
  );
});
