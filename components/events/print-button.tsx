"use client";

import { SECONDARY_ACTION_CLASS } from "@/components/page-header";

/** SAM-76 — a readable export: the browser's print (no new PDF pipeline). */
export function PrintButton() {
  return <button type="button" className={`${SECONDARY_ACTION_CLASS} print:hidden`} onClick={() => window.print()}>Imprimir / salvar em PDF</button>;
}