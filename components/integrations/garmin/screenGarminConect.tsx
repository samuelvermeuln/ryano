"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  disconnectGarminAction,
  saveGarminReportPreferencesAction,
  syncGarminAction,
  type ActionState,
} from "@/app/actions/integrations";
import { GarminScreen } from "@/components/integrations/garmin/garminScreen";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/format";

const initialState: ActionState = {};

type ScreenGarminConectProps = {
  connection: {
    status: string;
    lastSyncAt: Date | null;
    lastSyncStatus: string | null;
  } | null;
  notificationPreference?: {
    enabled: boolean;
    postActivityReport: boolean;
    dailySummary: boolean;
    reportTime: string | null;
    timezone: string | null;
  } | null;
  whatsappVerified?: boolean;
};

export function ScreenGarminConect({
  connection,
  notificationPreference = null,
  whatsappVerified = false,
}: ScreenGarminConectProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [connectionActionState, setConnectionActionState] = useState<ActionState>(initialState);
  const connected = connection?.status === "CONNECTED";

  return (
    <>
      <SectionCard
        title="Garmin"
        description="Conecte sua conta para trazer seus treinos automaticamente."
        action={
          <StatusBadge tone={connected ? "success" : "warning"}>
            {connected ? "Garmin conectado" : "Garmin não conectado"}
          </StatusBadge>
        }
      >
        <div className="space-y-5">
          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-foreground/72">
            <p>Conecte sua conta Garmin para começar a sincronizar seus treinos no RYVANO.</p>
          </div>

          {connectionActionState.message ? (
            <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 text-sm text-foreground/76">
              {connectionActionState.message}
            </div>
          ) : null}

          {!connected ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="glass-button-primary rounded-[18px] px-5 py-3 text-sm font-semibold"
            >
              Conectar com o Garmin
            </button>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard label="Status" value="Conectado" />
                <MetricCard label="Última sincronização" value={formatDateTime(connection?.lastSyncAt)} />
                <MetricCard label="Sync" value={connection?.lastSyncStatus ?? "—"} />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    const result = await syncGarminAction();
                    setConnectionActionState(result);
                    router.refresh();
                  }}
                  className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
                >
                  Sincronizar agora
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const result = await disconnectGarminAction();
                    setConnectionActionState(result);
                    router.refresh();
                  }}
                  className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
                >
                  Desconectar Garmin
                </button>
              </div>

              <GarminReportPreferencesForm preference={notificationPreference} whatsappVerified={whatsappVerified} />
            </div>
          )}
        </div>
      </SectionCard>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2 sm:p-4 md:p-6">
          <div className="flex min-h-full items-center justify-center">
            <div className="glass-strong relative h-[calc(100dvh-1rem)] w-full max-w-6xl overflow-hidden rounded-[20px] border border-white/10 shadow-2xl sm:h-[calc(100dvh-2rem)] md:h-[min(860px,calc(100dvh-3rem))]">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="absolute right-4 top-4 z-20 rounded-full bg-black/20 p-1.5 text-white/80 backdrop-blur transition hover:text-white"
              >
                <span className="sr-only">Fechar modal</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <GarminScreen
                connection={connection}
                fullHeight
                onSuccess={() => {
                  setModalOpen(false);
                  router.refresh();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function GarminReportPreferencesForm({
  preference,
  whatsappVerified,
}: {
  preference: ScreenGarminConectProps["notificationPreference"];
  whatsappVerified: boolean;
}) {
  const [state, formAction] = useActionState(saveGarminReportPreferencesAction, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Envios automáticos</p>
        <p className="text-sm leading-6 text-foreground/65">
          Cliente escolhe horário do resumo diário em UTC. Se não escolher, usamos 18:00 UTC. Ao entrar atividade nova na sincronização, relatório pós-atividade sai na hora.
        </p>
      </div>

      {state.message ? (
        <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 text-sm text-foreground/76">{state.message}</div>
      ) : null}

      {!whatsappVerified ? (
        <div className="rounded-[18px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          Confirme WhatsApp primeiro. Preferências já podem ser salvas, mas envios só disparam após verificação.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Checkbox name="enabled" defaultChecked={preference?.enabled ?? true} label="Mensageria habilitada" />
        <Checkbox name="postActivityReport" defaultChecked={preference?.postActivityReport ?? true} label="Relatório após atividade" />
        <Checkbox name="dailySummary" defaultChecked={preference?.dailySummary ?? false} label="Resumo diário" />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_1fr] md:items-end">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground/76">Horário do daily report</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <input
              name="reportTime"
              type="time"
              defaultValue={preference?.reportTime ?? "18:00"}
              className="w-full bg-transparent text-sm text-foreground outline-none"
            />
          </div>
        </label>

        <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-3 text-sm text-foreground/65">
          Horário interpretado em <span className="font-semibold text-foreground">UTC</span> nesta tela.
        </div>
      </div>

      <SubmitButton className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Salvando preferências...">
        Salvar preferências Garmin
      </SubmitButton>
    </form>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-sm text-foreground/55">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Checkbox({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <label className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-black/10 px-4 py-4 text-sm text-foreground/76">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 accent-[oklch(0.72_0.16_230)]" />
      <span>{label}</span>
    </label>
  );
}
