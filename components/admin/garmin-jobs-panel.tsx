"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  runGarminJobsAction,
  saveGarminReportingSettingsAction,
  type AdminActionState,
} from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/format";

type GarminJobsPanelProps = {
  initialSettings: {
    jobIntervalMinutes: number;
    maxUsersPerRun: number;
    maxProbesPerRun: number;
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

  const effectiveSettings = useMemo(
    () => settingsState.garminSettings ?? runState.garminSettings ?? initialSettings,
    [initialSettings, runState.garminSettings, settingsState.garminSettings],
  );

  const settingsFormKey = useMemo(
    () => [
      effectiveSettings.jobIntervalMinutes,
      effectiveSettings.maxUsersPerRun,
      effectiveSettings.maxProbesPerRun,
      effectiveSettings.delayBetweenUserSyncSeconds,
      effectiveSettings.maxMessagesPerRun,
      effectiveSettings.delayBetweenMessagesSeconds,
      effectiveSettings.maxMessagesPerHour,
      effectiveSettings.maxMessagesPerDay,
      effectiveSettings.whatsappDispatchPaused,
    ].join(":"),
    [effectiveSettings],
  );

  return (
    <div className="space-y-6">
      <form key={settingsFormKey} action={settingsAction} className="space-y-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
        <div className="space-y-2 text-sm text-foreground/72">
          <p className="font-semibold text-foreground">Controle de cadência e volume</p>
          <p>
            O cron pode bater no endpoint em frequência maior, mas o backend só executa quando o intervalo mínimo configurado for atingido. Sincronização Garmin e disparo WhatsApp rodam em lotes separados para evitar rajadas na API não oficial e no número da ryvano. Além disso, o envio respeita teto absoluto por hora e por dia.
          </p>
        </div>

        {settingsState.message ? (
          <div className="theme-panel-neutral rounded-[18px] border px-4 py-3 text-sm">
            {settingsState.message}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
          <NumberField
            name="jobIntervalMinutes"
            label="Intervalo mínimo do job"
            defaultValue={String(effectiveSettings.jobIntervalMinutes)}
            suffix="min"
          />
          <NumberField
            name="maxUsersPerRun"
            label="Máx. usuários por sincronização"
            defaultValue={String(effectiveSettings.maxUsersPerRun)}
            suffix="users"
          />
          <NumberField
            name="maxProbesPerRun"
            label="Máx. probes por execução"
            defaultValue={String(effectiveSettings.maxProbesPerRun)}
            suffix="probes"
          />
          <NumberField
            name="delayBetweenUserSyncSeconds"
            label="Pausa entre syncs"
            defaultValue={String(effectiveSettings.delayBetweenUserSyncSeconds)}
            suffix="seg"
          />
          <NumberField
            name="maxMessagesPerRun"
            label="Máx. mensagens por execução"
            defaultValue={String(effectiveSettings.maxMessagesPerRun)}
            suffix="msgs"
          />
          <NumberField
            name="delayBetweenMessagesSeconds"
            label="Pausa entre mensagens"
            defaultValue={String(effectiveSettings.delayBetweenMessagesSeconds)}
            suffix="seg"
          />
          <NumberField
            name="maxMessagesPerHour"
            label="Máx. mensagens por hora"
            defaultValue={String(effectiveSettings.maxMessagesPerHour)}
            suffix="hora"
          />
          <NumberField
            name="maxMessagesPerDay"
            label="Máx. mensagens por dia"
            defaultValue={String(effectiveSettings.maxMessagesPerDay)}
            suffix="dia"
          />
        </div>

        <label className="theme-panel-neutral flex items-center gap-3 rounded-[20px] border px-4 py-4 text-sm">
          <input
            name="whatsappDispatchPaused"
            type="checkbox"
            defaultChecked={effectiveSettings.whatsappDispatchPaused}
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
          <div className="theme-panel-neutral rounded-[22px] border px-4 py-3 text-sm">
            {runState.message}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-6">
          <MetricCard label="Elegíveis" value={String(runState.garminSyncSummary?.eligibleUsers ?? 0)} />
          <MetricCard label="Probes no lote" value={String(runState.garminSyncSummary?.scannedUsers ?? 0)} />
          <MetricCard label="Syncs completos" value={String(runState.garminSyncSummary?.syncedUsers ?? 0)} />
          <MetricCard label="Restantes" value={String(runState.garminSyncSummary?.remainingUsers ?? 0)} />
          <MetricCard label="Resumos diários enfileirados" value={String(runState.garminSyncSummary?.dailyQueued ?? 0)} />
          <MetricCard label="Mensagens enviadas" value={String(runState.garminSyncSummary?.dispatchSent ?? 0)} />
        </div>

        <div className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm leading-7">
          <p>Execução manual ignora espera do cron e roda na hora. Útil para teste operacional e auditoria.</p>
          <p className="mt-2">Ordem do lote Garmin prioriza usuários com sincronização mais antiga. Quem acabou de sincronizar vai para o fim da fila natural.</p>
          <p className="mt-2">Automação sugerida: chamar <code>/api/integrations/garmin/jobs</code> a cada 1 min. Backend limita probes, syncs pesados e envios pelo painel administrativo.</p>
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
  defaultValue,
  suffix,
}: {
  name: string;
  label: string;
  defaultValue: string;
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
            defaultValue={defaultValue}
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
