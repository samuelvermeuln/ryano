"use client";

import { useActionState } from "react";

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={connection?.status === "CONNECTED" ? "success" : connection ? "warning" : "neutral"}>
          {connection?.status ?? "Não conectada"}
        </StatusBadge>
        {connection?.lastSyncStatus ? <StatusBadge>{connection.lastSyncStatus}</StatusBadge> : null}
      </div>

      <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-foreground/72">
        <p>Para conectar sua conta Garmin nesta versão, informe o email e a senha usados no Garmin Connect.</p>
        <p>A conexão é processada pelo servidor da RYANO.</p>
        <p>Credenciais sensíveis não devem aparecer em logs ou respostas da aplicação.</p>
      </div>

      {state.message ? (
        <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
          {state.message}
        </div>
      ) : null}

      <form action={connectAction} className="grid gap-4 sm:grid-cols-2">
        <Field label="Email Garmin" name="email" type="email" />
        <Field label="Senha Garmin" name="password" type="password" />
        <div className="sm:col-span-2">
          <SubmitButton className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Conectando Garmin...">
            Conectar Garmin
          </SubmitButton>
        </div>
      </form>

      <div className="flex flex-wrap gap-3">
        <form
          action={async () => {
            await syncGarminAction();
          }}
        >
          <button type="submit" className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground">
            Sincronizar agora
          </button>
        </form>
        <form
          action={async () => {
            await disconnectGarminAction();
          }}
        >
          <button type="submit" className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground">
            Desconectar
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, name, type }: { label: string; name: string; type: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input rounded-[20px] px-4 py-3">
        <input name={name} type={type} className="w-full bg-transparent text-sm text-foreground outline-none" required />
      </div>
    </label>
  );
}
