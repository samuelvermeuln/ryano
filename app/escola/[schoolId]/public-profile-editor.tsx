"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconPencil } from "@tabler/icons-react";

import { Modal } from "@/components/modal";
import { RYVANO_SPORT_TYPES, getRyvanoSportLabel } from "@/modules/shared/activities/sport-types";

export type PublicProfileManager = { userId: string; name: string | null; email: string | null; isOwner: boolean };

type Props = {
  schoolId: string;
  initial: { achievements: string[]; specialties: string[]; sportTypes: string[]; adminContactUserId: string | null };
  managers: PublicProfileManager[];
};

const SPORT_OPTIONS = RYVANO_SPORT_TYPES.filter((sport) => sport !== "default");

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

/**
 * SAM-28 — the school edits what athletes read in the /app/escola modal:
 * achievements, specialties, sports and who answers for the school. One
 * centered modal (rules/ui.md), one PATCH to the existing school route; the
 * server decides who may edit and who may be the contact.
 */
export function PublicProfileEditor({ schoolId, initial, managers }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [achievements, setAchievements] = useState(initial.achievements.join("\n"));
  const [specialties, setSpecialties] = useState(initial.specialties.join("\n"));
  const [sports, setSports] = useState<string[]>(initial.sportTypes);
  const [adminContactUserId, setAdminContactUserId] = useState(initial.adminContactUserId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleSport = (sport: string) =>
    setSports((current) => (current.includes(sport) ? current.filter((item) => item !== sport) : [...current, sport]));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/schools/${schoolId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            achievements: lines(achievements).slice(0, 20),
            specialties: lines(specialties).slice(0, 20),
            sportTypes: sports,
            adminContactUserId: adminContactUserId || null,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
          setError(data.message ?? "Não foi possível salvar o perfil público.");
          return;
        }
        setOpen(false);
        router.refresh();
      } catch {
        setError("Não foi possível salvar o perfil público.");
      }
    });
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="glass-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
        <IconPencil size={16} /> Editar perfil público
      </button>

      {open ? (
        <Modal title="Perfil público da escola" onClose={() => setOpen(false)} size="lg">
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <p className="text-sm text-foreground/65">É isto que um atleta vê antes de pedir para entrar. Uma linha por item.</p>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Prêmios e conquistas</span>
              <textarea
                value={achievements}
                onChange={(event) => setAchievements(event.target.value)}
                rows={4}
                aria-label="Prêmios e conquistas (um por linha)"
                placeholder={"Ex.: Campeã estadual de travessia 2025\nTop 3 no Brasileiro Master"}
                className="glass-input w-full resize-none rounded-[14px] px-3 py-2 text-sm text-foreground outline-none"
              />
              <span className="block text-xs text-foreground/50">Até 20 itens, 120 caracteres cada.</span>
            </label>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Especialidades</span>
              <textarea
                value={specialties}
                onChange={(event) => setSpecialties(event.target.value)}
                rows={3}
                aria-label="Especialidades (uma por linha)"
                placeholder={"Ex.: Travessias em águas abertas\nIniciação adulta"}
                className="glass-input w-full resize-none rounded-[14px] px-3 py-2 text-sm text-foreground outline-none"
              />
            </label>

            <fieldset className="space-y-1.5 text-sm">
              <legend className="font-medium">Modalidades</legend>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Modalidades da escola">
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
              <span className="font-medium">Responsável administrativo</span>
              <select
                aria-label="Responsável administrativo"
                value={adminContactUserId}
                onChange={(event) => setAdminContactUserId(event.target.value)}
                className="glass-input w-full rounded-[14px] px-3 py-2.5 text-sm text-foreground outline-none"
              >
                <option value="">Dono da escola (padrão)</option>
                {managers.filter((manager) => !manager.isOwner).map((manager) => (
                  <option key={manager.userId} value={manager.userId}>
                    {manager.name ?? manager.email ?? "Gestor"}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-foreground/50">Aparece com nome e foto no perfil; só gestores ativos (OWNER/ADMIN).</span>
            </label>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="glass-button rounded-[14px] px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={isPending} className="glass-button-primary inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold disabled:opacity-60">
                {isPending ? <IconLoader2 size={16} className="animate-spin" /> : null} Salvar perfil público
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
