"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconPencil } from "@tabler/icons-react";

import { Modal } from "@/components/modal";
import { RYVANO_SPORT_TYPES, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";

export type CoachPublicProfileFields = {
  displayName: string;
  bio: string | null;
  sportTypes: string[];
  credentials: string[];
  acceptsIndependentAthletes: boolean;
};

const SPORT_OPTIONS = RYVANO_SPORT_TYPES.filter((sport) => sport !== "default");

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

/**
 * SAM-28 — the coach edits what athletes read in the /app/professor modal.
 * Centered modal (rules/ui.md); one PATCH to /api/coaches/me/profile.
 */
export function CoachProfileEditor({ profile }: { profile: CoachPublicProfileFields }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [sports, setSports] = useState<string[]>(profile.sportTypes);
  const [credentials, setCredentials] = useState(profile.credentials.join("\n"));
  const [acceptsIndependent, setAcceptsIndependent] = useState(profile.acceptsIndependentAthletes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleSport = (sport: string) =>
    setSports((current) => (current.includes(sport) ? current.filter((item) => item !== sport) : [...current, sport]));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/coaches/me/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: displayName.trim(),
            bio: bio.trim() || null,
            sportTypes: sports,
            credentials: lines(credentials).slice(0, 10),
            acceptsIndependentAthletes: acceptsIndependent,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
          setError(data.message ?? "Não foi possível salvar o perfil.");
          return;
        }
        setOpen(false);
        router.refresh();
      } catch {
        setError("Não foi possível salvar o perfil.");
      }
    });
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="glass-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
        <IconPencil size={16} /> Editar perfil
      </button>

      {open ? (
        <Modal title="Meu perfil de professor" onClose={() => setOpen(false)} size="lg">
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Nome de professor</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value.slice(0, 200))}
                required
                minLength={2}
                aria-label="Nome de professor"
                className="glass-input w-full rounded-[14px] px-3 py-2 text-sm text-foreground outline-none"
              />
            </label>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Apresentação</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value.slice(0, 2000))}
                rows={3}
                aria-label="Apresentação"
                className="glass-input w-full resize-none rounded-[14px] px-3 py-2 text-sm text-foreground outline-none"
              />
            </label>

            <fieldset className="space-y-1.5 text-sm">
              <legend className="font-medium">Modalidades que você treina</legend>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Modalidades do professor">
                {SPORT_OPTIONS.map((sport) => {
                  const checked = sports.includes(sport);
                  return (
                    <button
                      key={sport}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleSport(sport)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${checked ? "theme-pill-info" : "border-border text-foreground/70"}`}
                    >
                      {getRyvanoSportLabel(sport)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Credenciais</span>
              <textarea
                value={credentials}
                onChange={(event) => setCredentials(event.target.value)}
                rows={3}
                aria-label="Credenciais (uma por linha)"
                placeholder={"Ex.: CREF 012345-G/SP\nCertificação Total Immersion"}
                className="glass-input w-full resize-none rounded-[14px] px-3 py-2 text-sm text-foreground outline-none"
              />
              <span className="block text-xs text-foreground/50">Até 10 itens. Aparecem no seu perfil público.</span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={acceptsIndependent}
                onChange={(event) => setAcceptsIndependent(event.target.checked)}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
                aria-label="Aceito atletas independentes"
              />
              <span>
                <span className="font-medium">Aceito atletas independentes</span>
                <span className="mt-1 block text-xs leading-5 text-foreground/55">
                  Desmarcado, atletas só podem pedir seu acompanhamento dentro de uma escola em que vocês dois estejam.
                </span>
              </span>
            </label>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="glass-button rounded-[14px] px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={isPending || displayName.trim().length < 2} className="glass-button-primary inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold disabled:opacity-60">
                {isPending ? <IconLoader2 size={16} className="animate-spin" /> : null} Salvar perfil
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
