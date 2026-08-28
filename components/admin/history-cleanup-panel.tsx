"use client";

import { useActionState } from "react";

import { cleanupOperationalHistoryAction, type AdminActionState } from "@/app/actions/admin";
import { SubmitButton } from "@/components/submit-button";

type HistoryCleanupPanelProps = {
  referenceDays: number;
  counts: {
    messageDeliveriesTotal: number;
    messageDeliveriesEligible: number;
    integrationEventsTotal: number;
    integrationEventsEligible: number;
    adminAuditLogsTotal: number;
    adminAuditLogsEligible: number;
  };
};

export function HistoryCleanupPanel({ referenceDays, counts }: HistoryCleanupPanelProps) {
  const [state, action] = useActionState<AdminActionState, FormData>(cleanupOperationalHistoryAction, {});

  return (
    <div className="space-y-5">
      {state.message ? (
        <div className="theme-panel-neutral rounded-[22px] border px-4 py-3 text-sm">
          {state.message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <HistoryCard
          label="Fila WhatsApp"
          total={counts.messageDeliveriesTotal}
          eligible={counts.messageDeliveriesEligible}
          note={`Apaga apenas SENT/DELIVERED/FAILED com mais de ${referenceDays} dias.`}
        />
        <HistoryCard
          label="Eventos de integração"
          total={counts.integrationEventsTotal}
          eligible={counts.integrationEventsEligible}
          note={`Apaga registros com mais de ${referenceDays} dias.`}
        />
        <HistoryCard
          label="Auditoria admin"
          total={counts.adminAuditLogsTotal}
          eligible={counts.adminAuditLogsEligible}
          note={`Apaga logs com mais de ${referenceDays} dias.`}
        />
      </div>

      <form action={action} className="space-y-4 rounded-[22px] border border-amber-300/20 bg-amber-500/5 px-4 py-4">
        <div className="space-y-2 text-sm text-foreground/72">
          <p className="font-semibold text-foreground">Retenção operacional</p>
          <p>
            Use para reduzir histórico operacional antigo. Entregas pendentes não entram na limpeza.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground/76">Apagar itens mais antigos que</span>
            <div className="glass-input rounded-[20px] px-4 py-3">
              <div className="flex items-center gap-3">
                <input
                  name="days"
                  type="number"
                  min={1}
                  max={3650}
                  defaultValue={String(referenceDays)}
                  className="w-full bg-transparent text-sm text-foreground outline-none"
                  required
                />
                <span className="text-xs text-foreground/50">dias</span>
              </div>
            </div>
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <CleanupCheckbox
              name="messageDeliveries"
              title="Fila WhatsApp"
              description="Histórico de disparos e falhas"
            />
            <CleanupCheckbox
              name="integrationEvents"
              title="Eventos"
              description="Webhooks, jobs e integrações"
            />
            <CleanupCheckbox
              name="adminAuditLogs"
              title="Auditoria"
              description="Ações operacionais do admin"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground/76">Confirmação</span>
            <div className="glass-input rounded-[20px] px-4 py-3">
              <input
                name="confirm"
                type="text"
                placeholder="Digite LIMPAR"
                className="w-full bg-transparent text-sm text-foreground outline-none"
                autoComplete="off"
                required
              />
            </div>
          </label>

          <div className="rounded-[20px] border border-amber-300/15 bg-black/10 px-4 py-4 text-sm leading-7 text-foreground/68">
            <p>
              Operação irreversível no banco para histórico antigo. Use somente para retenção operacional.
            </p>
            <p className="mt-2">
              Recomendado: exportar CSV antes, manter ao menos 30–90 dias de janela e evitar rodar durante auditoria ativa.
            </p>
          </div>
        </div>

        <SubmitButton
          className="rounded-[20px] bg-amber-200 px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
          pendingLabel="Limpando histórico..."
        >
          Limpar histórico selecionado
        </SubmitButton>
      </form>
    </div>
  );
}

function HistoryCard({
  label,
  total,
  eligible,
  note,
}: {
  label: string;
  total: number;
  eligible: number;
  note: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-sm text-foreground/55">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{formatCount(total)} total</p>
      <p className="mt-1 text-sm text-amber-200/90">{formatCount(eligible)} elegíveis</p>
      <p className="mt-2 text-xs leading-6 text-foreground/50">{note}</p>
    </div>
  );
}

function CleanupCheckbox({
  name,
  title,
  description,
}: {
  name: string;
  title: string;
  description: string;
}) {
  return (
    <label className="theme-panel-neutral flex items-start gap-3 rounded-[20px] border px-4 py-4 text-sm">
      <input
        name={name}
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[oklch(0.72_0.16_230)]"
      />
      <span>
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="mt-1 block text-foreground/58">{description}</span>
      </span>
    </label>
  );
}

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}
