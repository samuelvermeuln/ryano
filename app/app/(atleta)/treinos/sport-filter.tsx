"use client";

/**
 * SAM-57 — modality filter of the athlete's calendar, in every view: keeps
 * the current view and date params and only swaps `modalidade`.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FIELD_CLASS } from "@/components/page-header";

export function SportFilter({ options, value }: { options: Array<{ value: string; label: string }>; value: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <label className="inline-flex items-center gap-2 text-xs text-foreground/60">
      Modalidade
      <select
        aria-label="Filtrar por modalidade"
        value={value ?? ""}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          if (event.target.value) params.set("modalidade", event.target.value);
          else params.delete("modalidade");
          const query = params.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
        className={`${FIELD_CLASS} w-auto py-1.5`}
      >
        <option value="">Todas</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
