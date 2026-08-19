"use client";

import { useActionState, useState } from "react";

import {
  refreshEvolutionQrAction,
  sendEvolutionTestMessageAction,
  type AdminActionState,
} from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

const initialState: AdminActionState = {};

export function EvolutionTools({ initialQrCode }: { initialQrCode?: string | null }) {
  const [testState, testAction] = useActionState(sendEvolutionTestMessageAction, initialState);
  const [refreshState, setRefreshState] = useState<AdminActionState>({ qrCode: initialQrCode ?? null });

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/76">
        {refreshState.message ? <p>{refreshState.message}</p> : null}
        {refreshState.qrCode ? (
          <pre className="overflow-x-auto rounded-[18px] border border-white/10 bg-black/20 p-4 text-xs leading-6 text-foreground/75">
            {refreshState.qrCode}
          </pre>
        ) : (
          <p>Sem QR em memória nesta sessão.</p>
        )}
        <button
          type="button"
          onClick={async () => {
            const result = await refreshEvolutionQrAction();
            setRefreshState(result);
          }}
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
        >
          Atualizar QR / reconnect
        </button>
      </div>

      <form action={testAction} className="space-y-4">
        {testState.message ? (
          <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
            {testState.message}
          </div>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground/76">Telefone de teste</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <input name="phone" type="text" placeholder="5511999990000" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40" required />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground/76">Mensagem</span>
          <div className="glass-input rounded-[20px] px-4 py-3">
            <textarea name="text" rows={4} defaultValue="Teste operacional RYANO via Evolution." className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40" required />
          </div>
        </label>

        <SubmitButton className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Enviando teste...">
          Enviar mensagem de teste
        </SubmitButton>
      </form>
    </div>
  );
}
