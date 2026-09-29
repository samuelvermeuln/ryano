"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const SIZE_CLASS = {
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centered modal for record detail (architecture/rules/ui.md): never an edge
 * drawer, because detail is read as one block and a narrow column breaks tables
 * and two-column lists.
 *
 * - `role="dialog"` + `aria-modal` + `aria-labelledby` pointing at the visible
 *   title; closes on Escape and on backdrop click.
 * - Rendered through a portal so an ancestor with `overflow`/`transform` cannot
 *   clip the backdrop or turn `position: fixed` into something relative.
 * - Locks the page scroll and restores the previous value, and returns focus to
 *   whatever opened it.
 * - Keeps Tab inside the dialog, so the content behind the backdrop is never
 *   reachable by keyboard while it is open.
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
  returnFocusTo,
  initialFocusTo,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof SIZE_CLASS;
  /**
   * Where focus goes on close. Defaults to whatever was focused on open, which
   * is wrong when the opener unmounts while the modal is up (a trigger replaced
   * by the modal, a row removed by the submitted action): the element is gone by
   * then, so the caller passes a ref to something that survives.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** First field to focus, instead of the dialog container. */
  initialFocusTo?: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    (initialFocusTo?.current ?? dialogRef.current)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      // Deliberately read at cleanup time rather than copied on open: the
      // caller's target may not be mounted yet when the dialog appears, and the
      // element that should receive focus is the one that exists on close.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      (returnFocusTo?.current ?? opener)?.focus();
    };
    // Open-time only: re-running would steal focus back mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`glass-strong relative z-10 flex w-full ${SIZE_CLASS[size]} flex-col rounded-3xl p-5 outline-none`}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-base font-semibold">{title}</h2>
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
