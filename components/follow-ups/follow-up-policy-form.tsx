"use client";

/**
 * SAM-56 — "Prazos e lembretes" (§7.2, §27.2): product options of the school
 * or of the independent coach, not training norms.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FIELD_CLASS, PRIMARY_ACTION_CLASS } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";

export type FollowUpPolicyFormValues = {
  firstAnalysisBusinessDays: number;
  reminderDaysBefore: number[];
  workingDays: number[];
  timeZone: string;
  notifyCoordinationOnOverdue: boolean;
  milestoneNotifyAthlete: boolean;
  milestoneNotifyCoach: boolean;
  syncWindowHours: number;
  isDefault: boolean;
};

const WEEKDAYS = [
  { value: 1, label: "Seg" }, { value: 2, label: "Ter" }, { value: 3, label: "Qua" }, { value: 4, label: "Qui" },
  { value: 5, label: "Sex" }, { value: 6, label: "Sáb" }, { value: 7, label: "Dom" },
];

export function FollowUpPolicyForm({ initial, schoolId }: { initial: FollowUpPolicyFormValues; schoolId: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [businessDays, setBusinessDays] = useState(String(initial.firstAnalysisBusinessDays));
  const [reminders, setReminders] = useState(initial.reminderDaysBefore.join(", "));
  const [workingDays, setWorkingDays] = useState<number[]>(initial.workingDays);
  const [timeZone, setTimeZone] = useState(initial.timeZone);
  const [coordination, setCoordination] = useState(initial.notifyCoordinationOnOverdue);
  const [milestoneAthlete, setMilestoneAthlete] = useState(initial.milestoneNotifyAthlete);
  const [milestoneCoach, setMilestoneCoach] = useState(initial.milestoneNotifyCoach);
  const [syncWindow, setSyncWindow] = useState(String(initial.syncWindowHours));

  function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const reminderDays = reminders.split(/[,;\s]+/).filter(Boolean).map(Number);
    if (reminderDays.some((value) => !Number.isInteger(value) || value < 1)) {
      setMessage({ tone: "error", text: "Lembretes: use números inteiros de dias, separados por vírgula." });
      return;
    }
    startTransition(async () => {
      const response = await fetch(`/api/follow-up-policy${schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : ""}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstAnalysisBusinessDays: Number(businessDays),
          reminderDaysBefore: reminderDays,
          workingDays,
          timeZone,
          notifyCoordinationOnOverdue: coordination,
          milestoneNotifyAthlete: milestoneAthlete,
          milestoneNotifyCoach: milestoneCoach,
          syncWindowHours: Number(syncWindow),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage({ tone: "error", text: payload?.message ?? "Não foi possível salvar." });
        return;
      }
      setMessage({ tone: "ok", text: "Prazos salvos. Valem para os próximos lembretes." });
      router.refresh();
    });
  }

  return (
    <SectionCard
      title="Prazos e lembretes"
      description={initial.isDefault ? "Usando o padrão: primeira análise em 2 dias úteis e lembretes 30, 14, 7 e 1 dia antes do evento." : "Configuração própria. São opções do serviço, não normas de treino."}
    >
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" data-testid="follow-up-policy-form">
        <label className="grid gap-1 text-sm">
          Primeira análise (dias úteis)
          <input type="number" min={0} max={30} required value={businessDays} onChange={(event) => setBusinessDays(event.target.value)} className={FIELD_CLASS} />
        </label>
        <label className="grid gap-1 text-sm">
          Lembretes antes do evento (dias)
          <input value={reminders} onChange={(event) => setReminders(event.target.value)} className={FIELD_CLASS} placeholder="30, 14, 7, 1" />
        </label>
        <fieldset className="grid gap-1 text-sm sm:col-span-2">
          <legend>Dias úteis</legend>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((day) => (
              <label key={day.value} className="inline-flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={workingDays.includes(day.value)}
                  onChange={(event) => setWorkingDays((current) => (event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value)))}
                />
                {day.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1 text-sm">
          Aguardando registro por (horas)
          <input type="number" min={1} max={336} value={syncWindow} onChange={(event) => setSyncWindow(event.target.value)} className={FIELD_CLASS} />
        </label>
        <label className="grid gap-1 text-sm">
          Fuso dos prazos
          <input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className={FIELD_CLASS} placeholder="America/Sao_Paulo" />
        </label>
        <div className="grid gap-1.5 text-xs">
          {schoolId && (
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={coordination} onChange={(event) => setCoordination(event.target.checked)} />
              Avisar a coordenação quando a primeira análise atrasar
            </label>
          )}
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={milestoneAthlete} onChange={(event) => setMilestoneAthlete(event.target.checked)} />
            Marcos avisam o aluno
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={milestoneCoach} onChange={(event) => setMilestoneCoach(event.target.checked)} />
            Marcos avisam o professor
          </label>
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className={PRIMARY_ACTION_CLASS}>Salvar prazos</button>
          {message && (
            <p role={message.tone === "error" ? "alert" : "status"} className={`text-xs ${message.tone === "error" ? "text-rose-400" : "text-foreground/70"}`}>{message.text}</p>
          )}
        </div>
      </form>
    </SectionCard>
  );
}
