"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  dispatchPendingMessageDeliveriesAction,
  forceDispatchPendingMessageDeliveriesAction,
  requeueFailedMessageDeliveriesAction,
  requeueMessageDeliveryAction,
  type AdminActionState,
} from "@/app/actions/admin";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

const STATUS_FILTERS = ["ALL", "PENDING", "FAILED", "SENT", "DELIVERED"] as const;
const TYPE_FILTERS = ["ALL", "POST_ACTIVITY_REPORT", "DAILY_GARMIN_SUMMARY"] as const;

type MessageDeliveryPanelProps = {
  activeStatus: string;
  activeType: string;
  counts: Record<string, number>;
  typeCounts: Record<string, number>;
  currentPage: number;
  totalPages: number;
  deliveries: Array<{
    id: string;
    userId: string;
    userLabel: string;
    type: string;
    status: string;
    errorCode: string | null;
    externalMessageId: string | null;
    createdAt: string;
    sentAt: string | null;
    failedAt: string | null;
  }>;
};

export function MessageDeliveryPanel({
  activeStatus,
  activeType,
  counts,
  typeCounts,
  currentPage,
  totalPages,
  deliveries,
}: MessageDeliveryPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<AdminActionState>({});
  const [running, setRunning] = useState(false);

  function pushFilters(input: { status?: string; type?: string; page?: number }) {
    const params = new URLSearchParams(searchParams.toString());

    const status = input.status ?? activeStatus;
    const type = input.type ?? activeType;
    const page = input.page ?? currentPage;

    if (status === "ALL") {
      params.delete("deliveryStatus");
    } else {
      params.set("deliveryStatus", status);
    }

    if (type === "ALL") {
      params.delete("deliveryType");
    } else {
      params.set("deliveryType", type);
    }

    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }

    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <div className="space-y-4">
      {state.message ? (
        <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
          {state.message}
          {state.messageQueueSummary?.paused ? (
            <p className="mt-2 text-xs text-foreground/55">
              Dispatcher estava pausado globalmente.
            </p>
          ) : null}
          {state.messageQueueSummary?.throttled ? (
            <p className="mt-2 text-xs text-foreground/55">
              Bloqueadas por limite horário/diário nesta rodada: {state.messageQueueSummary.throttled}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((type) => {
            const active = activeType === type;
            const count = type === "ALL"
              ? Object.values(typeCounts).reduce((sum, value) => sum + value, 0)
              : (typeCounts[type] ?? 0);

            return (
              <button
                key={type}
                type="button"
                onClick={() => pushFilters({ type, page: 1 })}
                className={active
                  ? "rounded-full border border-white/20 bg-white/12 px-4 py-2 text-xs font-semibold text-foreground"
                  : "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-foreground/72"
                }
              >
                {formatTypeLabel(type)} · {count}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((status) => {
            const active = activeStatus === status;
            const count = status === "ALL" ? Object.values(counts).reduce((sum, value) => sum + value, 0) : (counts[status] ?? 0);

            return (
              <button
                key={status}
                type="button"
                onClick={() => pushFilters({ status, page: 1 })}
                className={active
                  ? "rounded-full border border-white/20 bg-white/12 px-4 py-2 text-xs font-semibold text-foreground"
                  : "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-foreground/72"
                }
              >
                {status} · {count}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={async () => {
            setRunning(true);
            const result = await dispatchPendingMessageDeliveriesAction();
            setState(result);
            setRunning(false);
            router.refresh();
          }}
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
        >
          {running ? "Processando fila..." : "Processar fila pendente"}
        </button>

        <button
          type="button"
          onClick={async () => {
            setRunning(true);
            const result = await requeueFailedMessageDeliveriesAction();
            setState(result);
            setRunning(false);
            router.refresh();
          }}
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
        >
          Reenfileirar falhas
        </button>

        <button
          type="button"
          onClick={async () => {
            setRunning(true);
            const result = await forceDispatchPendingMessageDeliveriesAction();
            setState(result);
            setRunning(false);
            router.refresh();
          }}
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
        >
          Forçar envio agora
        </button>

        <Link
          href={buildExportHref(searchParams)}
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
        >
          Exportar CSV
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/70">
        <p>
          Página <span className="font-semibold text-foreground">{currentPage}</span> de <span className="font-semibold text-foreground">{totalPages}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => pushFilters({ page: Math.max(1, currentPage - 1) })}
            disabled={currentPage <= 1}
            className="glass-button rounded-[16px] px-4 py-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => pushFilters({ page: Math.min(totalPages, currentPage + 1) })}
            disabled={currentPage >= totalPages}
            className="glass-button rounded-[16px] px-4 py-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {deliveries.length ? (
          deliveries.map((delivery) => (
            <div key={delivery.id} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/72">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{delivery.type}</p>
                  <Link href={`/admin/usuarios/${delivery.userId}`} className="mt-1 inline-block text-xs text-foreground/55 underline">
                    {delivery.userLabel}
                  </Link>
                </div>
                <StatusBadge tone={getStatusTone(delivery.status)}>{delivery.status}</StatusBadge>
              </div>

              <div className="mt-3 grid gap-1 text-xs text-foreground/60">
                <p>Criado em: {formatDateTime(delivery.createdAt)}</p>
                <p>Enviado em: {formatDateTime(delivery.sentAt)}</p>
                <p>Falhou em: {formatDateTime(delivery.failedAt)}</p>
                <p>Erro: {delivery.errorCode ?? "—"}</p>
                <p>ID externo: {delivery.externalMessageId ?? "—"}</p>
              </div>

              {delivery.status === "FAILED" ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await requeueMessageDeliveryAction(delivery.id);
                      setState(result);
                      router.refresh();
                    }}
                    className="glass-button rounded-[18px] px-4 py-2 text-xs font-semibold text-foreground"
                  >
                    Reenfileirar entrega
                  </button>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/72">
            Nenhuma entrega encontrada neste filtro.
          </div>
        )}
      </div>
    </div>
  );
}

function getStatusTone(status: string) {
  if (status === "SENT" || status === "DELIVERED") {
    return "success" as const;
  }

  if (status === "FAILED") {
    return "danger" as const;
  }

  if (status === "PENDING") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function formatTypeLabel(type: string) {
  if (type === "POST_ACTIVITY_REPORT") {
    return "Pós-atividade";
  }

  if (type === "DAILY_GARMIN_SUMMARY") {
    return "Resumo diário";
  }

  return "Todos";
}

function buildExportHref(searchParams: ReturnType<typeof useSearchParams>) {
  const params = new URLSearchParams(searchParams.toString());
  const query = params.toString();

  return query ? `/api/admin/message-deliveries/export?${query}` : "/api/admin/message-deliveries/export";
}
