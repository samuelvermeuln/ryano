"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SIZE_CLASS = {
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

/**
 * Centered modal for record detail (architecture/rules/ui.md): never an edge
 * drawer, because detail is read as one block and a narrow column breaks tables
 * and two-column lists.
 *
 * - `role="dialog"` + `aria-modal` + `aria-label`; closes on Escape and on
 *   backdrop click.
 * - Rendered through a portal so an ancestor with `overflow`/`transform` cannot
 *   clip the backdrop or turn `position: fixed` into something relative.
 * - Locks the page scroll and restores the previous value, and returns focus to
 *   whatever opened it.
 * - Surface is `glass-strong`, which has a light variant; never hard-code a
 *   surface colour here.
 *
 * Mount it only in response to a user action (it reads `document`).
 */
export function Modal({
  title,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof SIZE_CLASS;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-black/60 p-3 sm:p-5">
      <div className="flex min-h-full items-center justify-center">
        <button
          type="button"
          aria-label="Fechar"
          tabIndex={-1}
          onClick={onClose}
          className="fixed inset-0 cursor-default"
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={`glass-strong relative z-10 flex w-full ${SIZE_CLASS[size]} flex-col rounded-3xl p-5 outline-none`}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="glass-button h-8 w-8 shrink-0 rounded-full text-sm"
            >
              ✕
            </button>
          </div>
          <div className="mt-4 flex-1">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
