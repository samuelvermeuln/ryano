/**
 * SAM-70 — §18.2: what a prescription was written against. The default
 * reading is the reference frozen at publication ("comparado com FTP 240 W
 * (avaliação de 10/09/2026)"); the current sheet, when given, is a separate,
 * labelled view — never silently substituted.
 */
import type { FrozenReference } from "@/modules/school/application/athlete-assessments";
import { ZONE_FAMILY_LABELS, type ZoneFamily } from "@/modules/school/domain/zone-profile";
import { formatTrackedValue, TRACKED_PARAMETER_LABELS } from "@/modules/school/presentation/prescription-targets";

export function readFrozenReference(snapshot: unknown): FrozenReference | null {
  const reference = (snapshot as { content?: { reference?: unknown } } | null)?.content?.reference;
  if (!reference || typeof reference !== "object") return null;
  const value = reference as Partial<FrozenReference>;
  return {
    sheetRevisionId: typeof value.sheetRevisionId === "string" ? value.sheetRevisionId : null,
    parameters: value.parameters && typeof value.parameters === "object" ? value.parameters : {},
    zoneProfiles: value.zoneProfiles && typeof value.zoneProfiles === "object" ? value.zoneProfiles : {},
    citations: value.citations && typeof value.citations === "object" ? value.citations : {},
  };
}

function ReferenceList({ reference, testId }: { reference: FrozenReference; testId: string }) {
  const parameters = Object.entries(reference.parameters) as Array<[keyof FrozenReference["parameters"], number]>;
  const profiles = Object.entries(reference.zoneProfiles) as Array<[ZoneFamily, { name: string; version: number }]>;
  return (
    <ul className="space-y-1 text-sm" data-testid={testId}>
      {parameters.map(([field, value]) => (
        <li key={field}>
          {reference.citations[field]
            ? `Comparado com ${reference.citations[field]}`
            : `${TRACKED_PARAMETER_LABELS[field] ?? field}: ${formatTrackedValue(field, value)}`}
        </li>
      ))}
      {profiles.map(([family, profile]) => (
        <li key={family} className="text-foreground/70">Zonas de {ZONE_FAMILY_LABELS[family].toLowerCase()}: perfil &quot;{profile.name}&quot; v{profile.version}</li>
      ))}
      {parameters.length === 0 && profiles.length === 0 && <li className="text-foreground/55">A ficha não tinha parâmetros registrados.</li>}
    </ul>
  );
}

export function PrescriptionReferenceCard({ frozen, current }: { frozen: FrozenReference | null; current?: FrozenReference | null }) {
  if (!frozen) return null;
  return (
    <section className="space-y-2 rounded-[20px] border border-white/10 bg-white/5 p-4" data-testid="prescription-reference">
      <h2 className="text-sm font-semibold">Referência da prescrição</h2>
      <p className="text-xs text-foreground/55">Valores vigentes quando a sessão foi publicada; uma avaliação nova não altera esta prescrição.</p>
      <ReferenceList reference={frozen} testId="frozen-reference" />
      {current && (
        <details className="pt-1">
          <summary className="cursor-pointer text-xs font-medium text-foreground/70">Ver com as zonas atuais</summary>
          <p className="mt-1 text-xs text-foreground/55">Ficha de hoje — leitura separada, não é a referência da prescrição.</p>
          <ReferenceList reference={current} testId="current-reference" />
        </details>
      )}
    </section>
  );
}
