"use client";

import { useEffect, useState } from "react";

/**
 * TM044 (RF-006/RF-109) — auto-fills the browser's IANA timezone into the
 * activation form. Server-rendered fallback ("America/Sao_Paulo") keeps the
 * form submittable with JS disabled; when JS runs, the real detected zone
 * overwrites it so `ActivateTrainingLicense` anchors the calendar correctly.
 */
export function TimezoneField({ defaultTimezone = "America/Sao_Paulo" }: { defaultTimezone?: string }) {
  const [timezone, setTimezone] = useState(defaultTimezone);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    } catch {
      // Keep the fallback — activation still works, just anchored to the default zone.
    }
  }, []);

  return (
    <div className="space-y-1">
      <label htmlFor="timezone" className="text-xs font-medium text-foreground/60">Fuso horário</label>
      <input
        id="timezone"
        name="timezone"
        type="text"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm"
      />
      <p className="text-[11px] text-foreground/40">Detectado automaticamente do seu navegador — ajuste se estiver incorreto.</p>
    </div>
  );
}
