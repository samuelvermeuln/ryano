"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  connectGarminAction,
  disconnectGarminAction,
  syncGarminAction,
  type ActionState,
} from "@/app/actions/integrations";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

type GarminConnectFormProps = {
  connection: {
    status: string;
    lastSyncAt: Date | null;
    lastSyncStatus: string | null;
  } | null;
};

export function GarminConnectForm({ connection }: GarminConnectFormProps) {
  const [state, connectAction] = useActionState(connectGarminAction, initialState);
  const [feedback, setFeedback] = useState<ActionState>({});
  const [pendingAction, startTransition] = useTransition();
  const router = useRouter();
  const connected = connection?.status === "CONNECTED";

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.refresh();
  }, [router, state.success]);

  const handleSync = () => {
    startTransition(async () => {
      const result = await syncGarminAction();
      setFeedback(result);
      router.refresh();
    });
  };

  const handleDisconnect = () => {
    startTransition(async () => {
      const result = await disconnectGarminAction();
      setFeedback(result);
      router.refresh();
    });
  };

  const statusLabel = connected ? "Garmin conectado" : "Garmin não conectado";
  const message = feedback.message ?? state.message;
  const success = feedback.success ?? state.success;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={connected ? "success" : "warning"}>{statusLabel}</StatusBadge>
        {connection?.lastSyncStatus ? <StatusBadge>{connection.lastSyncStatus}</StatusBadge> : null}
      </div>

      <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-foreground/72">
        <p>Use o mesmo e-mail e senha da sua conta Garmin Connect.</p>
        <p>Seus dados de acesso são usados somente para realizar a conexão.</p>
      </div>

      {connection?.lastSyncAt ? (
        <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/70">
          Última sincronização: {new Date(connection.lastSyncAt).toLocaleString("pt-BR")}
        </div>
      ) : null}

      {message ? (
        <div
          className={`rounded-[20px] px-4 py-3 text-sm ${
            success
              ? "border border-emerald-300/18 bg-emerald-300/8 text-emerald-100"
              : "border border-white/10 bg-white/5 text-foreground/76"
          }`}
        >
          {message}
        </div>
      ) : null}

      {!connected ? (
        <form action={connectAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail Garmin" name="email" type="email" />
          <Field label="Senha Garmin" name="password" type="password" />
          <div className="sm:col-span-2">
            <SubmitButton className="glass-button-primary rounded-[18px] px-5 py-3 text-sm font-semibold" pendingLabel="Conectando Garmin...">
              Conectar Garmin
            </SubmitButton>
          </div>
        </form>
      ) : null}

      {connected ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSync}
            disabled={pendingAction}
            className="glass-button rounded-[18px] px-5 py-3 text-sm font-semibold text-foreground"
          >
            {pendingAction ? "Sincronizando..." : "Sincronizar atividades"}
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={pendingAction}
            className="glass-button rounded-[18px] px-5 py-3 text-sm font-semibold text-foreground"
          >
            Desconectar
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, name, type }: { label: string; name: string; type: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input rounded-[18px] px-4 py-3">
        <input name={name} type={type} className="w-full bg-transparent text-sm text-foreground outline-none" required />
      </div>
    </label>
  );
}
