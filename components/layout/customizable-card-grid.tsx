"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { IconArrowsHorizontal, IconDeviceFloppy, IconGripVertical, IconX } from "@tabler/icons-react";

export type SavedCardLayoutValue = Array<string | { id: string; span?: number | null }>;

export type CustomizableCardGridItem = {
  id: string;
  label: string;
  defaultSpan?: 1 | 2;
  accentClassName: string;
  content: ReactNode;
};

export type CustomizableCardLayout = Array<{ id: string; span: 1 | 2 }>;

export type CustomizableCardGridActionResult = {
  success?: boolean;
  message?: string;
};

export function CustomizableCardGrid({
  items,
  savedLayout,
  onSave,
  gridClassName = "grid gap-4 xl:grid-cols-2",
  pendingTitle = "Alterações de layout pendentes",
  pendingDescription = "Sua nova ordem e o novo tamanho dos cards foram detectados. Salve para aplicar na sua conta.",
  saveLabel = "Salvar layout",
  discardLabel = "Descartar",
}: {
  items: CustomizableCardGridItem[];
  savedLayout?: SavedCardLayoutValue;
  onSave: (input: { layout: CustomizableCardLayout }) => Promise<CustomizableCardGridActionResult>;
  gridClassName?: string;
  pendingTitle?: string;
  pendingDescription?: string;
  saveLabel?: string;
  discardLabel?: string;
}) {
  const reducedMotion = Boolean(useReducedMotion());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [resizingCardId, setResizingCardId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dragCardIdRef = useRef<string | null>(null);
  const lastDropTargetIdRef = useRef<string | null>(null);
  const resizeCardIdRef = useRef<string | null>(null);

  const defaultLayout = useMemo<CustomizableCardLayout>(
    () => items.map((item) => ({ id: item.id, span: item.defaultSpan ?? 1 })),
    [items],
  );

  const [persistedLayout, setPersistedLayout] = useState<CustomizableCardLayout>(defaultLayout);
  const [layout, setLayout] = useState<CustomizableCardLayout>(defaultLayout);

  useEffect(() => {
    const normalized = normalizeLayout(savedLayout, defaultLayout);
    setPersistedLayout(normalized);
    setLayout(normalized);
  }, [defaultLayout, savedLayout]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const orderedItems = layout
    .map((entry) => {
      const item = itemById.get(entry.id);
      return item ? { item, span: entry.span } : null;
    })
    .filter((entry): entry is { item: CustomizableCardGridItem; span: 1 | 2 } => entry !== null);

  const hasUnsavedChanges = !isSameLayout(layout, persistedLayout);

  function handleCardDragStart(cardId: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    setFeedback(null);
    dragCardIdRef.current = cardId;
    lastDropTargetIdRef.current = null;
    setDraggedCardId(cardId);
    setDropTargetId(null);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const activeCardId = dragCardIdRef.current;
      if (!activeCardId) {
        return;
      }

      const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const targetCard = target instanceof Element ? target.closest<HTMLElement>("[data-layout-card-id]") : null;
      const targetCardId = targetCard?.dataset.layoutCardId ?? null;

      if (!targetCardId || targetCardId === activeCardId) {
        if (lastDropTargetIdRef.current !== null) {
          lastDropTargetIdRef.current = null;
          setDropTargetId(null);
        }
        return;
      }

      if (lastDropTargetIdRef.current === targetCardId) {
        return;
      }

      lastDropTargetIdRef.current = targetCardId;
      setDropTargetId(targetCardId);
      setLayout((current) => moveLayoutItemBeforeTarget(current, activeCardId, targetCardId));
    };

    const finishDrag = () => {
      dragCardIdRef.current = null;
      lastDropTargetIdRef.current = null;
      setDraggedCardId(null);
      setDropTargetId(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
  }

  function handleResizeStart(cardId: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    setFeedback(null);
    resizeCardIdRef.current = cardId;
    setResizingCardId(cardId);

    const button = event.currentTarget;
    const startX = event.clientX;
    const startEntry = layout.find((entry) => entry.id === cardId);
    const startSpan = startEntry?.span ?? 1;

    button.setPointerCapture?.(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const activeCardId = resizeCardIdRef.current;
      if (!activeCardId) {
        return;
      }

      const deltaX = moveEvent.clientX - startX;
      const nextSpan = deltaX >= 24 ? 2 : deltaX <= -24 ? 1 : startSpan;
      setLayout((current) => updateLayoutSpan(current, activeCardId, nextSpan));
    };

    const finishResize = () => {
      resizeCardIdRef.current = null;
      setResizingCardId(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  }

  return (
    <>
      <div className={gridClassName}>
        {orderedItems.map(({ item, span }) => {
          const isDragged = draggedCardId === item.id;
          const isDropTarget = dropTargetId === item.id && draggedCardId !== item.id;
          const isResizing = resizingCardId === item.id;

          return (
            <motion.article
              key={item.id}
              layout
              data-layout-card-id={item.id}
              whileHover={reducedMotion ? undefined : { y: -3, scale: 1.01 }}
              whileTap={reducedMotion ? undefined : { scale: 0.985 }}
              transition={{
                duration: 0.42,
                ease: [0.22, 1, 0.36, 1],
                layout: { duration: reducedMotion ? 0.1 : 0.28, ease: [0.22, 1, 0.36, 1] },
              }}
              className={`relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_10px_26px_rgba(0,0,0,0.10)] before:absolute before:inset-x-0 before:top-0 before:h-px ${item.accentClassName} ${span === 2 ? "xl:col-span-2" : ""} ${isDragged ? "opacity-65" : ""} ${isResizing ? "ring-2 ring-amber-300/40" : ""}`}
            >
              <div className="mb-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onPointerDown={(event) => handleCardDragStart(item.id, event)}
                  className="grid h-9 w-9 cursor-grab place-items-center rounded-full text-foreground/68 transition hover:bg-white/8 hover:text-foreground active:cursor-grabbing touch-none"
                  aria-label={`Arrastar ${item.label}`}
                  title={`Arrastar ${item.label}`}
                >
                  <IconGripVertical size={16} />
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => handleResizeStart(item.id, event)}
                  className="grid h-9 w-9 cursor-ew-resize place-items-center rounded-full text-foreground/68 transition hover:bg-white/8 hover:text-foreground touch-none"
                  aria-label={`Redimensionar ${item.label}`}
                  title={`Redimensionar ${item.label}`}
                >
                  <IconArrowsHorizontal size={16} />
                </button>
              </div>

              <AnimatePresence>
                {isDropTarget ? (
                  <motion.div
                    initial={reducedMotion ? false : { opacity: 0, scale: 0.98 }}
                    animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
                    exit={reducedMotion ? undefined : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="pointer-events-none absolute inset-3 rounded-[18px] border border-dashed border-sky-300/55 bg-sky-300/7"
                  >
                    <div className="absolute left-4 top-4 rounded-full border border-sky-300/30 bg-sky-300/12 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-sky-100">
                      Solte aqui
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {isDragged ? (
                  <motion.div
                    initial={reducedMotion ? false : { opacity: 0 }}
                    animate={reducedMotion ? undefined : { opacity: 1 }}
                    exit={reducedMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className="pointer-events-none absolute inset-3 rounded-[18px] border border-dashed border-white/25 bg-white/4"
                  >
                    <div className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/18 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-foreground/82">
                      Movendo card
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {item.content}
            </motion.article>
          );
        })}
      </div>

      <AnimatePresence>
        {hasUnsavedChanges ? (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 20 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 20 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,720px)] -translate-x-1/2 rounded-[22px] border border-white/10 bg-[#0b1120]/92 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{pendingTitle}</p>
                <p className="mt-1 text-sm leading-6 text-foreground/66">{pendingDescription}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setLayout(cloneLayout(persistedLayout));
                    setFeedback(null);
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-foreground transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <IconX size={16} />
                  {discardLabel}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setFeedback(null);
                    startTransition(async () => {
                      const result = await onSave({
                        layout: layout.map((entry) => ({ id: entry.id, span: entry.span })),
                      });

                      if (result.success) {
                        setPersistedLayout(cloneLayout(layout));
                      }

                      setFeedback(result.message ?? null);
                    });
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <IconDeviceFloppy size={16} />
                  {isPending ? "Salvando..." : saveLabel}
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {feedback ? (
        <div className="mt-3 flex justify-start">
          <div className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-semibold tracking-[0.14em] text-sky-100">
            {feedback}
          </div>
        </div>
      ) : null}
    </>
  );
}

function normalizeLayout(savedLayout: SavedCardLayoutValue | undefined, defaultLayout: CustomizableCardLayout) {
  if (!savedLayout?.length) {
    return cloneLayout(defaultLayout);
  }

  const defaultMap = new Map(defaultLayout.map((entry) => [entry.id, entry]));
  const next: CustomizableCardLayout = [];

  for (const item of savedLayout) {
    if (typeof item === "string") {
      const fallback = defaultMap.get(item);
      if (fallback && !next.some((entry) => entry.id === item)) {
        next.push({ id: fallback.id, span: fallback.span });
      }
      continue;
    }

    if (!item || typeof item !== "object" || typeof item.id !== "string") {
      continue;
    }

    const fallback = defaultMap.get(item.id);
    if (!fallback || next.some((entry) => entry.id === item.id)) {
      continue;
    }

    next.push({
      id: fallback.id,
      span: item.span === 2 ? 2 : 1,
    });
  }

  for (const fallback of defaultLayout) {
    if (!next.some((entry) => entry.id === fallback.id)) {
      next.push({ id: fallback.id, span: fallback.span });
    }
  }

  return next;
}

function moveLayoutItemBeforeTarget(layout: CustomizableCardLayout, sourceId: string, targetId: string) {
  const sourceIndex = layout.findIndex((entry) => entry.id === sourceId);
  const targetIndex = layout.findIndex((entry) => entry.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return layout;
  }

  const next = cloneLayout(layout);
  const [moved] = next.splice(sourceIndex, 1);

  if (!moved) {
    return layout;
  }

  next.splice(targetIndex, 0, moved);
  return next;
}

function updateLayoutSpan(layout: CustomizableCardLayout, cardId: string, span: 1 | 2) {
  let changed = false;

  const next = layout.map((entry) => {
    if (entry.id !== cardId || entry.span === span) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      span,
    };
  });

  return changed ? next : layout;
}

function isSameLayout(left: CustomizableCardLayout, right: CustomizableCardLayout) {
  return left.length === right.length && left.every((entry, index) => entry.id === right[index]?.id && entry.span === right[index]?.span);
}

function cloneLayout(layout: CustomizableCardLayout) {
  return layout.map((entry) => ({ ...entry }));
}
