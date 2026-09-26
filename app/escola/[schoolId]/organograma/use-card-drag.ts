"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Movement in pixels before a press becomes a drag instead of a click. */
export const DRAG_THRESHOLD_PX = 6;

export type DragState<T> = {
  payload: T;
  x: number;
  y: number;
  /** False while the pointer is down but still inside the threshold. */
  active: boolean;
  /** Value of `dropAttribute` under the pointer, resolved as the pointer moves. */
  over: string | null;
};

type Options<T> = {
  onDrop: (payload: T, dropValue: string | null) => void;
  onClick: (payload: T) => void;
  enabled: boolean;
  /** Data attribute marking a valid drop zone, e.g. "data-drop-coach". */
  dropAttribute: string;
};

/**
 * Pointer-based drag for the organograma cards.
 *
 * Built on Pointer Events rather than HTML5 drag-and-drop because the latter
 * does not fire on touch devices, and rather than a drag library because the
 * only requirement here is "move one card onto another".
 *
 * A press only becomes a drag after DRAG_THRESHOLD_PX of movement, so a plain
 * click still opens the details drawer and a small tremor while clicking does
 * not start a transfer. The click is emitted on release only if the threshold
 * was never crossed.
 */
export function useCardDrag<T>({ onDrop, onClick, enabled, dropAttribute }: Options<T>) {
  const [drag, setDrag] = useState<DragState<T> | null>(null);
  const origin = useRef<{ x: number; y: number; payload: T; pointerId: number } | null>(null);
  const crossed = useRef(false);
  // Latest callbacks, read by listeners that are registered once per drag.
  // Assigned in an effect rather than during render, which React forbids.
  const handlers = useRef({ onDrop, onClick, dropAttribute });
  useEffect(() => {
    handlers.current = { onDrop, onClick, dropAttribute };
  }, [onDrop, onClick, dropAttribute]);

  /** Drop zone under a viewport point, or null when there is none. */
  const zoneAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)
      ?.closest(`[${handlers.current.dropAttribute}]`)
      ?.getAttribute(handlers.current.dropAttribute) ?? null;

  const start = useCallback((event: React.PointerEvent, payload: T) => {
    if (!enabled || event.button !== 0) return;
    origin.current = { x: event.clientX, y: event.clientY, payload, pointerId: event.pointerId };
    crossed.current = false;
    setDrag({ payload, x: event.clientX, y: event.clientY, active: false, over: null });
  }, [enabled]);

  useEffect(() => {
    if (!drag) return;

    const move = (event: PointerEvent) => {
      const from = origin.current;
      if (!from || event.pointerId !== from.pointerId) return;
      const distance = Math.hypot(event.clientX - from.x, event.clientY - from.y);
      if (!crossed.current && distance < DRAG_THRESHOLD_PX) return;
      crossed.current = true;
      // Suppresses text selection and page scrolling once dragging for real.
      event.preventDefault();
      // Resolved here, in an event handler, so the highlighted drop zone does
      // not need an effect that would re-render on every pointer move.
      setDrag({
        payload: from.payload,
        x: event.clientX,
        y: event.clientY,
        active: true,
        over: zoneAt(event.clientX, event.clientY),
      });
    };

    const finish = (event: PointerEvent) => {
      const from = origin.current;
      origin.current = null;
      setDrag(null);
      if (!from || event.pointerId !== from.pointerId) return;
      if (crossed.current) {
        // The dragged ghost sits under the cursor, so ask the document what is
        // beneath the release point instead of trusting the event target.
        handlers.current.onDrop(from.payload, zoneAt(event.clientX, event.clientY));
      } else {
        handlers.current.onClick(from.payload);
      }
      crossed.current = false;
    };

    const cancel = () => {
      origin.current = null;
      crossed.current = false;
      setDrag(null);
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    // A drag in progress must not survive the tab losing focus, or the card
    // would stay glued to the cursor after the user comes back.
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [drag]);

  return { drag: drag?.active ? drag : null, start };
}
