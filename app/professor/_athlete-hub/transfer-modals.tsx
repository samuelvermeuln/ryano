"use client";

/**
 * SAM-30 — the coach's two transfer proposals, as centred modals
 * (architecture/rules/ui.md): "Transferir para escola" from the independent
 * hub and "Continuar como independente" from a school hub. Both only PROPOSE:
 * the athlete confirms, and a school still approves who enters it.
 */
import { useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { proposeTransferAction, type AthleteHubActionState } from "./actions";

function ProposalModal({
  triggerLabel,
  triggerTestId,
  title,
  children,
  successMessage,
  fields,
}: {
  triggerLabel: string;
  triggerTestId: string;
  title: string;
  children: React.ReactNode;
  successMessage: string;
  /** Hidden + visible fields of the form. */
  fields: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AthleteHubActionState>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Handled in the submit path, not in an effect watching the returned state:
  // the modal must react to the write that actually happened (see technical-sheet-form).
  async function submit(formData: FormData) {
    const result = await proposeTransferAction(state, formData);
    setState(result);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setState({}); setOpen(true); }}
        data-testid={triggerTestId}
        className="glass-button rounded-full px-4 py-2 text-sm font-medium"
      >
        {triggerLabel}
      </button>

      {open && (
        <Modal title={title} onClose={() => setOpen(false)} returnFocusTo={triggerRef}>
          {state.success ? (
            <div className="space-y-4">
              <p className="theme-panel-success rounded-[18px] border px-4 py-3 text-sm" data-testid="transfer-proposed">
                {successMessage}
              </p>
              <div className="flex justify-end">
                <button type="button" onClick={() => setOpen(false)} className="glass-button rounded-[14px] px-4 py-2 text-sm font-medium">
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            <form action={submit} className="space-y-4">
              {children}
              {fields}
              {state.message && (
                <p role="alert" className="theme-panel-danger rounded-[18px] border px-4 py-3 text-sm">{state.message}</p>
              )}
              {state.fieldErrors?.schoolId && (
                <p role="alert" className="text-sm text-destructive">{state.fieldErrors.schoolId}</p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="glass-button rounded-[14px] px-4 py-2 text-sm font-medium">
                  Agora não
                </button>
                <SubmitButton pendingLabel="Enviando…" className="glass-button-primary rounded-[14px] px-4 py-2 text-sm font-semibold disabled:opacity-60">
                  Enviar proposta
                </SubmitButton>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

/** From the independent hub: pick one of the coach's schools; the athlete then joins it with this coach. */
export function TransferToSchoolModal({
  athleteId,
  athleteName,
  schools,
}: {
  athleteId: string;
  athleteName: string;
  schools: Array<{ id: string; name: string }>;
}) {
  return (
    <ProposalModal
      triggerLabel="Transferir para escola"
      triggerTestId="transfer-to-school"
      title={`Transferir ${athleteName} para uma escola`}
      successMessage="Proposta enviada. O atleta confirma em Escolas e a escola aprova o vínculo; o acompanhamento continua lá."
      fields={
        <>
          <input type="hidden" name="kind" value="to-school" />
          <input type="hidden" name="athleteId" value={athleteId} />
          {schools.length === 0 ? (
            <p className="theme-panel-warning rounded-[18px] border px-4 py-3 text-sm">
              Você não está ativo em nenhuma escola que receba atletas. Vincule-se a uma escola primeiro.
            </p>
          ) : (
            <label className="block space-y-1.5 text-sm">
              <span className="text-foreground/75">Escola</span>
              <select name="schoolId" defaultValue={schools[0]?.id} aria-label="Escola" className="glass-input w-full rounded-[14px] px-3 py-2.5 text-sm text-foreground outline-none">
                {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </select>
            </label>
          )}
        </>
      }
    >
      <p className="text-sm leading-6 text-foreground/75">
        O atleta recebe o convite para entrar na escola já com você como professor. A escola aprova o vínculo e,
        quando isso acontece, o acompanhamento independente é encerrado e continua dentro da escola.
      </p>
    </ProposalModal>
  );
}

/** From a school hub: propose keeping the athlete outside the school; their membership stays. */
export function ContinueIndependentModal({
  athleteId,
  athleteName,
  schoolId,
  schoolName,
}: {
  athleteId: string;
  athleteName: string;
  schoolId: string;
  schoolName: string;
}) {
  return (
    <ProposalModal
      triggerLabel="Continuar como independente"
      triggerTestId="transfer-to-independent"
      title={`Continuar com ${athleteName} fora da ${schoolName}`}
      successMessage="Proposta enviada. Quando o atleta confirmar, o vínculo nesta escola é encerrado e o acompanhamento continua na sua central de coach independente."
      fields={
        <>
          <input type="hidden" name="kind" value="to-independent" />
          <input type="hidden" name="athleteId" value={athleteId} />
          <input type="hidden" name="schoolId" value={schoolId} />
        </>
      }
    >
      <p className="text-sm leading-6 text-foreground/75">
        O atleta continua membro da {schoolName}, mas sem professor responsável por lá; o acompanhamento passa a
        ser independente, com você. A administração da escola é avisada quando o atleta confirmar.
      </p>
    </ProposalModal>
  );
}
