/* eslint-disable @next/next/no-img-element */

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  dispatchPendingMessageDeliveriesAction,
  forceDispatchPendingMessageDeliveriesAction,
  redeliverUpdatedMessageDeliveryAction,
  requeueAndDispatchMessageDeliveryAction,
  requeueFailedMessageDeliveriesAction,
  requeueMessageDeliveryAction,
  type AdminActionState,
} from "@/app/actions/admin";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

const STATUS_FILTERS = ["ALL", "PENDING", "FAILED", "SENT", "DELIVERED"] as const;
const TYPE_FILTERS = [
  "ALL",
  "POST_ACTIVITY_REPORT",
  "DAILY_GARMIN_SUMMARY",
  "GARMIN_DAILY_SYNC_CHECK",
  "GARMIN_RECONNECT_ALERT",
] as const;

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
    debugDetail?: string | null;
    debugEndpoint?: string | null;
    debugVariant?: string | null;
    debugAttempts?: string[];
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
  const [pendingBatchAction, setPendingBatchAction] = useState<string | null>(null);
  const [pendingDeliveryAction, setPendingDeliveryAction] = useState<{ deliveryId: string; action: string } | null>(null);
  const [copiedDeliveryId, setCopiedDeliveryId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{
    delivery: MessageDeliveryPanelProps["deliveries"][number];
    imageUrl: string | null;
    caption: string | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

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

  async function runBatchAction(action: string, handler: () => Promise<AdminActionState>) {
    setPendingBatchAction(action);

    try {
      const result = await handler();
      setState(result);
      router.refresh();
    } finally {
      setPendingBatchAction(null);
    }
  }

  async function runDeliveryAction(deliveryId: string, action: string, handler: () => Promise<AdminActionState>) {
    setPendingDeliveryAction({ deliveryId, action });

    try {
      const result = await handler();
      setState(result);
      router.refresh();
    } finally {
      setPendingDeliveryAction(null);
    }
  }

  function isDeliveryActionPending(deliveryId: string, action: string) {
    return pendingDeliveryAction?.deliveryId === deliveryId && pendingDeliveryAction.action === action;
  }

  async function openDeliveryPreview(delivery: MessageDeliveryPanelProps["deliveries"][number]) {
    if (previewState?.imageUrl) {
      URL.revokeObjectURL(previewState.imageUrl);
    }

    setPendingDeliveryAction({ deliveryId: delivery.id, action: "preview" });
    setPreviewState({
      delivery,
      imageUrl: null,
      caption: null,
      loading: true,
      error: null,
    });

    try {
      const response = await fetch(buildDeliveryPreviewHref(delivery.id), {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "PREVIEW_LOAD_FAILED");
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      const encodedCaption = response.headers.get("X-WhatsApp-Caption");

      setPreviewState({
        delivery,
        imageUrl,
        caption: encodedCaption ? decodeURIComponent(encodedCaption) : null,
        loading: false,
        error: null,
      });
    } catch (error) {
      setPreviewState({
        delivery,
        imageUrl: null,
        caption: null,
        loading: false,
        error: error instanceof Error ? error.message : "PREVIEW_LOAD_FAILED",
      });
    } finally {
      setPendingDeliveryAction(null);
    }
  }

  function closePreview() {
    setPreviewState((current) => {
      if (current?.imageUrl) {
        URL.revokeObjectURL(current.imageUrl);
      }

      return null;
    });
  }

  useEffect(() => {
    return () => {
      if (previewState?.imageUrl) {
        URL.revokeObjectURL(previewState.imageUrl);
      }
    };
  }, [previewState]);

  return (
    <div className="space-y-4">
      {state.message ? (
        <div className="theme-panel-neutral rounded-[22px] border px-4 py-3 text-sm">
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
          {state.transportDebug ? (
            <div className="mt-3 rounded-[18px] border border-cyan-300/12 bg-cyan-400/8 px-3 py-3 text-xs leading-6 text-foreground/76">
              <p><span className="font-semibold text-foreground">Modo:</span> {state.transportDebug.mode}</p>
              <p className="break-words"><span className="font-semibold text-foreground">Endpoint:</span> {state.transportDebug.endpoint}</p>
              <p><span className="font-semibold text-foreground">Variante:</span> {state.transportDebug.variant ?? "—"}</p>
              <p className="break-words"><span className="font-semibold text-foreground">Tentativas:</span> {state.transportDebug.attempts?.length ? state.transportDebug.attempts.join(" | ") : "—"}</p>
              <p className="break-words"><span className="font-semibold text-foreground">Detalhe:</span> {state.transportDebug.errorDetail ?? "—"}</p>
            </div>
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
                  ? "theme-pill-info rounded-full border px-4 py-2 text-xs font-semibold"
                  : "theme-pill-neutral rounded-full border px-4 py-2 text-xs font-semibold"
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
                  ? "theme-pill-info rounded-full border px-4 py-2 text-xs font-semibold"
                  : "theme-pill-neutral rounded-full border px-4 py-2 text-xs font-semibold"
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
          onClick={() => runBatchAction("dispatch", dispatchPendingMessageDeliveriesAction)}
          disabled={Boolean(pendingBatchAction)}
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingBatchAction === "dispatch" ? "Processando fila..." : "Processar fila pendente"}
        </button>

        <button
          type="button"
          onClick={() => runBatchAction("requeue-failed", requeueFailedMessageDeliveriesAction)}
          disabled={Boolean(pendingBatchAction)}
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingBatchAction === "requeue-failed" ? "Reenfileirando..." : "Reenfileirar falhas"}
        </button>

        <button
          type="button"
          onClick={() => runBatchAction("force-dispatch", forceDispatchPendingMessageDeliveriesAction)}
          disabled={Boolean(pendingBatchAction)}
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingBatchAction === "force-dispatch" ? "Forçando envio..." : "Forçar envio agora"}
        </button>

        <Link
          href={buildExportHref(searchParams)}
          className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground"
        >
          Exportar CSV
        </Link>
      </div>

      <div className="theme-panel-neutral flex flex-wrap items-center justify-between gap-3 rounded-[20px] border px-4 py-3 text-sm">
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
            <div key={delivery.id} className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{formatDeliveryTypeDisplay(delivery.type)}</p>
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
                <p>Erro: {delivery.debugDetail ?? delivery.errorCode ?? "—"}</p>
                <p>Endpoint: {delivery.debugEndpoint ?? "—"}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{delivery.status === "SENT" || delivery.status === "DELIVERED" ? "Variante vencedora" : "Última variante"}:</span>
                  <span className={getVariantBadgeClass(delivery.status, delivery.debugVariant)}>
                    {delivery.debugVariant ?? "—"}
                  </span>
                </div>
                <p>ID externo: {delivery.externalMessageId ?? "—"}</p>
                <p className="break-words">Tentativas: {delivery.debugAttempts?.length ? delivery.debugAttempts.join(" | ") : "—"}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(buildDeliveryDebugText(delivery));
                    setCopiedDeliveryId(delivery.id);
                  }}
                  disabled={Boolean(pendingDeliveryAction)}
                  className="glass-button rounded-[18px] px-4 py-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {copiedDeliveryId === delivery.id ? "Debug copiado" : "Copiar debug"}
                </button>

                <button
                  type="button"
                  onClick={() => openDeliveryPreview(delivery)}
                  disabled={Boolean(pendingDeliveryAction)}
                  className="glass-button rounded-[18px] px-4 py-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeliveryActionPending(delivery.id, "preview") ? "Carregando preview..." : "Ver preview atualizado"}
                </button>

                {delivery.status === "FAILED" || delivery.status === "PENDING" ? (
                  <>
                    {delivery.status === "FAILED" ? (
                      <button
                        type="button"
                        onClick={() => runDeliveryAction(delivery.id, "requeue", () => requeueMessageDeliveryAction(delivery.id))}
                        disabled={Boolean(pendingDeliveryAction)}
                        className="glass-button rounded-[18px] px-4 py-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isDeliveryActionPending(delivery.id, "requeue") ? "Reenfileirando..." : "Reenfileirar entrega"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => runDeliveryAction(delivery.id, "dispatch", () => requeueAndDispatchMessageDeliveryAction(delivery.id))}
                      disabled={Boolean(pendingDeliveryAction)}
                      className="glass-button-primary rounded-[18px] px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isDeliveryActionPending(delivery.id, "dispatch")
                        ? "Enviando..."
                        : delivery.status === "FAILED"
                          ? "Reenfileirar + testar agora"
                          : "Testar agora"}
                    </button>
                  </>
                ) : null}

                {delivery.status === "SENT" || delivery.status === "DELIVERED" ? (
                  <button
                    type="button"
                    onClick={() => runDeliveryAction(delivery.id, "redeliver", () => redeliverUpdatedMessageDeliveryAction(delivery.id))}
                    disabled={Boolean(pendingDeliveryAction)}
                    className="glass-button-primary rounded-[18px] px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeliveryActionPending(delivery.id, "redeliver") ? "Reenviando..." : "Reenviar com dados atualizados"}
                  </button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm">
            Nenhuma entrega encontrada neste filtro.
          </div>
        )}
      </div>

      <PreviewDialog
        preview={previewState}
        previousDelivery={previewState ? getAdjacentDelivery(deliveries, previewState.delivery.id, -1) : null}
        nextDelivery={previewState ? getAdjacentDelivery(deliveries, previewState.delivery.id, 1) : null}
        onClose={closePreview}
        onNavigate={openDeliveryPreview}
        onApprove={async (delivery) => {
          if (delivery.status === "SENT" || delivery.status === "DELIVERED") {
            await runDeliveryAction(delivery.id, "redeliver", () => redeliverUpdatedMessageDeliveryAction(delivery.id));
            closePreview();
            return;
          }

          await runDeliveryAction(delivery.id, "dispatch", () => requeueAndDispatchMessageDeliveryAction(delivery.id));
          closePreview();
        }}
        actionLoadingLabel={previewState ? getPreviewApproveLoadingLabel(previewState.delivery, pendingDeliveryAction) : null}
      />
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

  if (type === "GARMIN_DAILY_SYNC_CHECK") {
    return "Aviso diário";
  }

  if (type === "GARMIN_RECONNECT_ALERT") {
    return "Reconexão Garmin";
  }

  return "Todos";
}

function getVariantBadgeClass(status: string, variant: string | null | undefined) {
  if (!variant) {
    return "rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-foreground/70";
  }

  if (status === "SENT" || status === "DELIVERED") {
    return "rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-100";
  }

  if (status === "FAILED") {
    return "rounded-full border border-rose-300/20 bg-rose-400/10 px-2 py-1 text-[11px] font-semibold text-rose-100";
  }

  return "rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[11px] font-semibold text-amber-100";
}

function buildDeliveryDebugText(delivery: MessageDeliveryPanelProps["deliveries"][number]) {
  return JSON.stringify({
    deliveryId: delivery.id,
    userId: delivery.userId,
    userLabel: delivery.userLabel,
    type: delivery.type,
    canonicalType: getCanonicalDeliveryType(delivery.type),
    status: delivery.status,
    errorCode: delivery.errorCode,
    debugDetail: delivery.debugDetail ?? null,
    debugEndpoint: delivery.debugEndpoint ?? null,
    debugVariant: delivery.debugVariant ?? null,
    debugAttempts: delivery.debugAttempts ?? [],
    externalMessageId: delivery.externalMessageId ?? null,
    createdAt: delivery.createdAt,
    sentAt: delivery.sentAt,
    failedAt: delivery.failedAt,
  }, null, 2);
}

function formatDeliveryTypeDisplay(type: string) {
  const canonical = getCanonicalDeliveryType(type);

  if (canonical === type) {
    return type;
  }

  return `${canonical} · histórico de reenvio`;
}

function getCanonicalDeliveryType(type: string) {
  const marker = "::RESENT:";
  const markerIndex = type.indexOf(marker);

  return markerIndex === -1 ? type : type.slice(0, markerIndex);
}

function buildDeliveryPreviewHref(deliveryId: string) {
  return `/api/admin/whatsapp-reports/preview?deliveryId=${encodeURIComponent(deliveryId)}`;
}

function getPreviewApproveLabel(delivery: MessageDeliveryPanelProps["deliveries"][number]) {
  return delivery.status === "SENT" || delivery.status === "DELIVERED"
    ? "Aprovar e reenviar"
    : "Aprovar e enviar agora";
}

function getPreviewApproveLoadingLabel(
  delivery: MessageDeliveryPanelProps["deliveries"][number],
  pendingDeliveryAction: { deliveryId: string; action: string } | null,
) {
  if (!pendingDeliveryAction || pendingDeliveryAction.deliveryId !== delivery.id) {
    return null;
  }

  if (pendingDeliveryAction.action === "redeliver") {
    return "Reenviando...";
  }

  if (pendingDeliveryAction.action === "dispatch") {
    return "Enviando...";
  }

  return null;
}

function PreviewDialog({
  preview,
  previousDelivery,
  nextDelivery,
  onClose,
  onNavigate,
  onApprove,
  actionLoadingLabel,
}: {
  preview: {
    delivery: MessageDeliveryPanelProps["deliveries"][number];
    imageUrl: string | null;
    caption: string | null;
    loading: boolean;
    error: string | null;
  } | null;
  previousDelivery: MessageDeliveryPanelProps["deliveries"][number] | null;
  nextDelivery: MessageDeliveryPanelProps["deliveries"][number] | null;
  onClose: () => void;
  onNavigate: (delivery: MessageDeliveryPanelProps["deliveries"][number]) => Promise<void>;
  onApprove: (delivery: MessageDeliveryPanelProps["deliveries"][number]) => Promise<void>;
  actionLoadingLabel: string | null;
}) {
  if (!preview || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-black/70 p-3 sm:p-5">
      <div className="flex min-h-full items-center justify-center" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Preview da mensagem WhatsApp"
          onClick={(event) => event.stopPropagation()}
          className="theme-panel-neutral w-full max-w-6xl rounded-[28px] border p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">Preview do WhatsApp</p>
              <p className="mt-2 text-base font-semibold text-foreground">{formatDeliveryTypeDisplay(preview.delivery.type)}</p>
              <p className="mt-1 text-sm text-foreground/60">{preview.delivery.userLabel}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => previousDelivery ? onNavigate(previousDelivery) : undefined}
                disabled={preview.loading || !previousDelivery || Boolean(actionLoadingLabel)}
                className="glass-button rounded-[18px] px-4 py-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {preview.loading ? "Carregando..." : "Anterior"}
              </button>
              <button
                type="button"
                onClick={() => nextDelivery ? onNavigate(nextDelivery) : undefined}
                disabled={preview.loading || !nextDelivery || Boolean(actionLoadingLabel)}
                className="glass-button rounded-[18px] px-4 py-2 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {preview.loading ? "Carregando..." : "Próxima"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="glass-button rounded-[18px] px-4 py-2 text-xs font-semibold text-foreground"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => onApprove(preview.delivery)}
                disabled={preview.loading || Boolean(preview.error) || Boolean(actionLoadingLabel)}
                className="glass-button-primary rounded-[18px] px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoadingLabel ?? getPreviewApproveLabel(preview.delivery)}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
            <div className="space-y-4">
              <div className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">Resumo</p>
                <div className="mt-3 grid gap-2 text-sm text-foreground/72">
                  <p><span className="font-semibold text-foreground">Tipo:</span> {formatDeliveryTypeDisplay(preview.delivery.type)}</p>
                  <p><span className="font-semibold text-foreground">Status:</span> {preview.delivery.status}</p>
                  <p><span className="font-semibold text-foreground">Criado em:</span> {formatDateTime(preview.delivery.createdAt)}</p>
                  <p><span className="font-semibold text-foreground">Usuário:</span> {preview.delivery.userLabel}</p>
                </div>

                <div className="mt-4 grid gap-2 rounded-[18px] border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-foreground/68">
                  <p className="font-semibold uppercase tracking-[0.16em] text-foreground/46">Navegação</p>
                  <p>
                    <span className="font-semibold text-foreground">Anterior:</span>{" "}
                    {previousDelivery ? formatDeliveryTypeDisplay(previousDelivery.type) : "—"}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Próxima:</span>{" "}
                    {nextDelivery ? formatDeliveryTypeDisplay(nextDelivery.type) : "—"}
                  </p>
                </div>
              </div>

              <div className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">Legenda</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/72">
                  {preview.caption ?? (preview.loading ? "Carregando legenda..." : "Sem legenda disponível.")}
                </p>
              </div>
            </div>

            <div className="theme-panel-neutral flex min-h-[640px] items-center justify-center rounded-[22px] border p-3 sm:p-4">
              {preview.loading ? (
                <div className="flex flex-col items-center gap-3 text-sm text-foreground/60">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
                  <p>Gerando preview atualizado...</p>
                </div>
              ) : preview.error ? (
                <div className="max-w-md text-center text-sm text-rose-200">
                  Falha ao gerar preview: {preview.error}
                </div>
              ) : preview.imageUrl ? (
                <img
                  src={preview.imageUrl}
                  alt={`Preview de ${formatDeliveryTypeDisplay(preview.delivery.type)}`}
                  className="h-auto max-h-[82vh] w-full rounded-[18px] object-contain"
                />
              ) : (
                <div className="text-sm text-foreground/60">Preview indisponível.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function getAdjacentDelivery(
  deliveries: MessageDeliveryPanelProps["deliveries"],
  currentDeliveryId: string,
  offset: -1 | 1,
) {
  const currentIndex = deliveries.findIndex((delivery) => delivery.id === currentDeliveryId);

  if (currentIndex === -1) {
    return null;
  }

  return deliveries[currentIndex + offset] ?? null;
}

function buildExportHref(searchParams: ReturnType<typeof useSearchParams>) {
  const params = new URLSearchParams(searchParams.toString());
  const query = params.toString();

  return query ? `/api/admin/message-deliveries/export?${query}` : "/api/admin/message-deliveries/export";
}
