"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconEdit, IconEye, IconLoader2 } from "@tabler/icons-react";

import { Modal } from "@/components/modal";

type OpenChangeRequest = { status: string; reason: string } | null;

type Props = {
  assignmentId: string;
  status: string;
  hasExecution: boolean;
  /** A responsible coach and a school are needed for a change request. */
  canRequestChange: boolean;
  openChangeRequest: OpenChangeRequest;
  openReviewRequest: boolean;
};

const ABSENCE_STATUSES = new Set(["SCHEDULED", "AVAILABLE", "RESCHEDULED", "MISSED"]);

type Dialog = "change" | "absence" | "review" | null;

/**
 * SAM-27 — what the athlete can do about one prescription without leaving the
 * screen: ask the coach to change it, ask for a review of what was done, and
 * report an absence (justified or not). Each action is a small centered modal
 * (architecture/rules/ui.md) that posts to its route and refreshes the page.
 */
export function WorkoutActions({ assignmentId, status, hasExecution, canRequestChange, openChangeRequest, openReviewRequest }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const close = () => {
    setDialog(null);
    setText("");
    setError(null);
  };

  const post = (path: string, body: Record<string, unknown>) => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/workout-assignments/${assignmentId}/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
          setError(data.message ?? "Não foi possível concluir agora.");
          return;
        }
        close();
        router.refresh();
      } catch {
        setError("Não foi possível concluir agora.");
      }
    });
  };

  const canReportAbsence = ABSENCE_STATUSES.has(status);

  return (
    <section className="space-y-3" data-testid="workout-actions">
      <div className="flex flex-wrap gap-2">
        {canRequestChange && !openChangeRequest ? (
          <button type="button" onClick={() => setDialog("change")} className="glass-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
            <IconEdit size={16} /> Pedir alteração
          </button>
        ) : null}
        {hasExecution && !openReviewRequest ? (
          <button type="button" onClick={() => setDialog("review")} className="glass-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
            <IconEye size={16} /> Pedir revisão
          </button>
        ) : null}
        {canReportAbsence ? (
          <button type="button" onClick={() => setDialog("absence")} className="glass-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
            <IconAlertTriangle size={16} /> {status === "MISSED" ? "Justificar falta" : "Não vou conseguir"}
          </button>
        ) : null}
      </div>

      {openChangeRequest ? (
        <div className="theme-panel-warning rounded-[16px] border px-4 py-3 text-sm" data-testid="change-requested">
          <p className="font-medium">Alteração solicitada — aguardando o professor</p>
          <p className="mt-1 text-foreground/75">&ldquo;{openChangeRequest.reason}&rdquo;</p>
        </div>
      ) : null}
      {openReviewRequest ? (
        <div className="theme-panel-neutral rounded-[16px] border px-4 py-3 text-sm" data-testid="review-requested">
          Revisão pedida. O professor verá seu pedido ao avaliar este treino.
        </div>
      ) : null}

      {dialog === "change" ? (
        <Modal title="Pedir alteração do treino" onClose={close}>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); post("change-request", { reason: text.trim() }); }}>
            <p className="text-sm text-foreground/70">Explique o que gostaria de mudar. O professor recebe o pedido e decide; a prescrição só muda pelas mãos dele.</p>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 2000))}
              rows={4}
              required
              aria-label="Motivo da alteração"
              placeholder="Ex.: a distância está acima do que consigo nesta semana…"
              className="glass-input w-full resize-none rounded-[14px] px-3 py-2 text-sm text-foreground outline-none"
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="glass-button rounded-[14px] px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={isPending || text.trim().length === 0} className="glass-button-primary inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold disabled:opacity-60">
                {isPending ? <IconLoader2 size={16} className="animate-spin" /> : null} Enviar pedido
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialog === "review" ? (
        <Modal title="Pedir revisão do treino" onClose={close}>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); post("comments", { kind: "REVIEW_REQUEST", body: text.trim() || "Pode revisar este treino?" }); }}>
            <p className="text-sm text-foreground/70">O professor é avisado para avaliar o que você fez. Se quiser, diga o que você gostaria que ele olhasse.</p>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 2000))}
              rows={3}
              aria-label="Mensagem para a revisão"
              placeholder="Opcional"
              className="glass-input w-full resize-none rounded-[14px] px-3 py-2 text-sm text-foreground outline-none"
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="glass-button rounded-[14px] px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={isPending} className="glass-button-primary inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold disabled:opacity-60">
                {isPending ? <IconLoader2 size={16} className="animate-spin" /> : null} Pedir revisão
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialog === "absence" ? (
        <Modal title={status === "MISSED" ? "Justificar a falta" : "Não vou conseguir fazer"} onClose={close}>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); post("absence", { reason: text.trim() || null }); }}>
            <p className="text-sm text-foreground/70">
              Com uma justificativa o treino fica <strong>Justificado</strong> e não conta como falta na sua adesão. Sem justificativa ele fica <strong>Não realizado</strong>.
            </p>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 2000))}
              rows={3}
              aria-label="Justificativa"
              placeholder="Ex.: viagem de trabalho, dor no joelho…"
              className="glass-input w-full resize-none rounded-[14px] px-3 py-2 text-sm text-foreground outline-none"
            />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="glass-button rounded-[14px] px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={isPending} className="glass-button-primary inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold disabled:opacity-60">
                {isPending ? <IconLoader2 size={16} className="animate-spin" /> : null}
                {text.trim() ? "Registrar falta justificada" : "Registrar falta"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
