"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  runGarminJobsAction,
  saveGarminReportingSettingsAction,
  type AdminActionState,
} from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/format";

const initialState: AdminActionState = {};

type GarminJobsPanelProps = {
  initialSettings: {
    jobIntervalMinutes: number;
    maxUsersPerRun: number;
    delayBetweenUserSyncSeconds: number;
    maxMessagesPerRun: number;
    delayBetweenMessagesSeconds: number;
    maxMessagesPerHour: number;
    maxMessagesPerDay: number;
    whatsappDispatchPaused: boolean;
    lastRunAt: string | null;
    nextAllowedAt: string | null;
    due: boolean;
  };
};

export function GarminJobsPanel({ initialSettings }: GarminJobsPanelProps) {
  const router = useRouter();
  const [runState, setRunState] = useState<AdminActionState>({
    garminSettings: initialSettings,
  });
  const [settingsState, settingsAction] = useActionState(saveGarminReportingSettingsAction, {
    garminSettings: initialSettings,
  });
  const [running, setRunning] = useState(false);
  const [jobIntervalMinutes, setJobIntervalMinutes] = useState(String(initialSettings.jobIntervalMinutes));
  const [maxUsersPerRun, setMaxUsersPerRun] = useState(String(initialSettings.maxUsersPerRun));
  const [delayBetweenUserSyncSeconds, setDelayBetweenUserSyncSeconds] = useState(String(initialSettings.delayBetweenUserSyncSeconds));
  const [maxMessagesPerRun, setMaxMessagesPerRun] = useState(String(initialSettings.maxMessagesPerRun));
  const [delayBetweenMessagesSeconds, setDelayBetweenMessagesSeconds] = useState(String(initialSettings.delayBetweenMessagesSeconds));
  const [maxMessagesPerHour, setMaxMessagesPerHour] = useState(String(initialSettings.maxMessagesPerHour));
  const [maxMessagesPerDay, setMaxMessagesPerDay] = useState(String(initialSettings.maxMessagesPerDay));
  const [whatsappDispatchPaused, setWhatsappDispatchPaused] = useState(initialSettings.whatsappDispatchPaused);

  const effectiveSettings = useMemo(
    () => settingsState.garminSettings ?? runState.garminSettings ?? initialSettings,
    [initialSettings, runState.garminSettings, settingsState.garminSettings],
  );

  useEffect(() => {
    setJobIntervalMinutes(String(effectiveSettings.jobIntervalMinutes));
    setMaxUsersPerRun(String(effectiveSettings.maxUsersPerRun));
    setDelayBetweenUserSyncSeconds(String(effectiveSettings.delayBetweenUserSyncSeconds));
    setMaxMessagesPerRun(String(effectiveSettings.maxMessagesPerRun));
    setDelayBetweenMessagesSeconds(String(effectiveSettings.delayBetweenMessagesSeconds));
    setMaxMessagesPerHour(String(effectiveSettings.maxMessagesPerHour));
    setMaxMessagesPerDay(String(effectiveSettings.maxMessagesPerDay));
    setWhatsappDispatchPaused(effectiveSettings.whatsappDispatchPaused);
  }, [
    effectiveSettings.delayBetweenMessagesSeconds,
    effectiveSettings.delayBetweenUserSyncSeconds,
    effectiveSettings.jobIntervalMinutes,
    effectiveSettings.maxMessagesPerDay,
    effectiveSettings.maxMessagesPerHour,
    effectiveSettings.maxMessagesPerRun,
    effectiveSettings.maxUsersPerRun,
    effectiveSettings.whatsappDispatchPaused,
  ]);

  return (
    <div className="space-y-6">
      <form action={settingsAction} className="space-y-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
        <div className="space-y-2 text-sm text-foreground/72">
          <p className="font-semibold text-foreground">Controle de cadência e volume</p>
          <p>
            O cron pode bater no endpoint em frequência maior, mas o backend só executa quando o intervalo mínimo configurado for atingido. Sync Garmin e disparo WhatsApp rodam em lotes separados para evitar rajadas na API não oficial e no número da ryvano. Além disso, o envio respeita teto absoluto por hora e por dia.
          </p>
        </div>

        {settingsState.message ? (
          <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 text-sm text-foreground/76">
            {settingsState.message}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <NumberField
            name="jobIntervalMinutes"
            label="Intervalo mínimo do job"
            value={jobIntervalMinutes}
            onChange={setJobIntervalMinutes}
            suffix="min"
          />
          <NumberField
            name="maxUsersPerRun"
            label="Máx. usuários por sync"
            value={maxUsersPerRun}
            onChange={setMaxUsersPerRun}
            suffix="users"
          />
          <NumberField
            name="delayBetweenUserSyncSeconds"
            label="Pausa entre syncs"
            value={delayBetweenUserSyncSeconds}
            onChange={setDelayBetweenUserSyncSeconds}
            suffix="seg"
          />
          <NumberField
            name="maxMessagesPerRun"
            label="Máx. mensagens por execução"
            value={maxMessagesPerRun}
            onChange={setMaxMessagesPerRun}
            suffix="msgs"
          />
          <NumberField
            name="delayBetweenMessagesSeconds"
            label="Pausa entre mensagens"
            value={delayBetweenMessagesSeconds}
            onChange={setDelayBetweenMessagesSeconds}
            suffix="seg"
          />
          <NumberField
            name="maxMessagesPerHour"
            label="Máx. mensagens por hora"
            value={maxMessagesPerHour}
            onChange={setMaxMessagesPerHour}
            suffix="hora"
          />
          <NumberField
            name="maxMessagesPerDay"
            label="Máx. mensagens por dia"
            value={maxMessagesPerDay}
            onChange={setMaxMessagesPerDay}
            suffix="dia"
          />
        </div>

        <label className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-black/10 px-4 py-4 text-sm text-foreground/76">
          <input
            name="whatsappDispatchPaused"
            type="checkbox"
            checked={whatsappDispatchPaused}
            onChange={(event) => setWhatsappDispatchPaused(event.target.checked)}
            className="h-4 w-4 accent-[oklch(0.72_0.16_230)]"
          />
          <span>Pausar envios WhatsApp globalmente</span>
        </label>

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Última execução" value={formatDateTime(effectiveSettings.lastRunAt)} />
          <MetricCard label="Próxima janela" value={formatDateTime(effectiveSettings.nextAllowedAt)} />
          <MetricCard label="Pode executar agora" value={effectiveSettings.due ? "Sim" : "Ainda não"} />
          <MetricCard label="Envios WhatsApp" value={effectiveSettings.whatsappDispatchPaused ? "Pausados" : "Ativos"} />
        </div>

        <SubmitButton className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground" pendingLabel="Salvando ajustes Garmin...">
          Salvar limites Garmin
        </SubmitButton>
      </form>

      <form
        action={async () => {
          setRunning(true);
          const result = await runGarminJobsAction();
          setRunState(result);
          setRunning(false);
          router.refresh();
        }}
        className="space-y-4"
      >
        {runState.message ? (
          <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
            {runState.message}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-5">
          <MetricCard label="Elegíveis" value={String(runState.garminSyncSummary?.eligibleUsers ?? 0)} />
          <MetricCard label="Sync no lote" value={String(runState.garminSyncSummary?.scannedUsers ?? 0)} />
          <MetricCard label="Restantes" value={String(runState.garminSyncSummary?.remainingUsers ?? 0)} />
          <MetricCard label="Daily enfileirados" value={String(runState.garminSyncSummary?.dailyQueued ?? 0)} />
          <MetricCard label="Mensagens enviadas" value={String(runState.garminSyncSummary?.dispatchSent ?? 0)} />
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-foreground/72">
          <p>Execução manual ignora espera do cron e roda na hora. Útil para teste operacional e auditoria.</p>
          <p className="mt-2">Ordem do lote Garmin prioriza usuários com sync mais antiga. Quem acabou de sincronizar vai para o fim da fila natural.</p>
          <p className="mt-2">Automação sugerida: chamar <code>/api/integrations/garmin/jobs</code> a cada 1 min ou 5 min. Backend respeita intervalo salvo no admin.</p>
        </div>

        <SubmitButton
          className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold"
          pendingLabel={running ? "Executando jobs Garmin..." : "Executando jobs Garmin..."}
        >
          Executar jobs Garmin agora
        </SubmitButton>
      </form>
    </div>
  );
}

function NumberField({
  name,
  label,
  value,
  onChange,
  suffix,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input rounded-[20px] px-4 py-3">
        <div className="flex items-center gap-3">
          <input
            name={name}
            type="number"
            min={0}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full bg-transparent text-sm text-foreground outline-none"
            required
          />
          <span className="text-xs text-foreground/50">{suffix}</span>
        </div>
      </div>
    </label>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-sm text-foreground/55">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
