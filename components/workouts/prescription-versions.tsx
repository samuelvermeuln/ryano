/**
 * SAM-59 — the versions of one prescription, newest first: what the athlete
 * received, what replaced it and any amendment made after execution — each
 * with date, reason and author. Shown to the coach and to the athlete.
 */
import type { PrescriptionVersionView } from "@/modules/school/application/prescription-revisions";

export function PrescriptionVersions({ versions }: { versions: PrescriptionVersionView[] }) {
  if (versions.length <= 1) return null;
  return (
    <div className="space-y-2" data-testid="prescription-versions">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/55">Versões desta prescrição</p>
      <ol className="space-y-1.5 text-sm">
        {versions.map((version, index) => (
          <li key={version.workoutId} className="rounded-[16px] border border-white/10 bg-white/5 px-3 py-2" data-testid="prescription-version">
            <span className="font-medium">
              {index === versions.length - 1 ? "Versão original" : version.amendment ? "Emenda após a execução" : "Nova versão"}
            </span>
            {version.current && <span className="ml-2 text-xs text-primary">vigente</span>}
            {version.received && !version.current && <span className="ml-2 text-xs text-foreground/60">recebida pelo atleta</span>}
            <span className="block text-xs text-foreground/55">
              {version.createdAt.toLocaleString("pt-BR")}
              {version.reason ? ` · motivo: ${version.reason}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
