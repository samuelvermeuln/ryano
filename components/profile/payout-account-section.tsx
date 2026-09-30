"use client";

import { useActionState } from "react";
import { IconBuildingBank } from "@tabler/icons-react";

import {
  openSellerDashboardAction,
  refreshSellerPayoutStatusAction,
  startSellerOnboardingAction,
  type SellerPayoutActionState,
} from "@/app/actions/seller-payout";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import type { SellerPayoutAccountView } from "@/modules/school/application/get-seller-payout-accounts";
import {
  SELLER_PAYOUT_STATUS_LABELS,
  sellerPayoutPrimaryAction,
  type SellerPayoutStatus,
} from "@/modules/school/domain/seller-account";

/**
 * SAM-13 — seção "Conta de recebimento" do Perfil. Um card por beneficiário
 * (Professor / Escola), deixando explícito de quem é a conta que está sendo
 * configurada — as contas são independentes e nunca se sobrescrevem.
 *
 * Nada de dado bancário aqui: todo cadastro acontece no onboarding hospedado
 * do provedor; esta tela só lê o status espelhado pelo backend e oferece a
 * ação correspondente. "Verificada" nunca é decidido nesta UI.
 */
const TONE: Record<SellerPayoutStatus, "neutral" | "success" | "warning" | "danger"> = {
  NOT_CONFIGURED: "warning",
  ONBOARDING_STARTED: "warning",
  PENDING_VERIFICATION: "neutral",
  ACTION_REQUIRED: "warning",
  VERIFIED: "success",
  BLOCKED: "danger",
};

const DESCRIPTION: Record<SellerPayoutStatus, string> = {
  NOT_CONFIGURED:
    "As vendas continuam sendo registradas, mas o repasse só é liberado depois que sua conta de recebimento for cadastrada e verificada.",
  ONBOARDING_STARTED:
    "O cadastro foi iniciado, mas não foi concluído. Continue de onde parou — não é preciso preencher tudo de novo.",
  PENDING_VERIFICATION:
    "Cadastro enviado. O provedor ainda está verificando os dados; os repasses ficam pendentes até a confirmação.",
  ACTION_REQUIRED:
    "O provedor precisa de informações adicionais para liberar os repasses. Resolva as pendências para continuar.",
  VERIFIED: "Conta verificada pelo provedor. Os repasses seguem as regras financeiras atuais do Marketplace.",
  BLOCKED: "O provedor recusou ou bloqueou esta conta. Consulte o provedor ou o suporte da Ryvano.",
};

type Notice = { tone: "warning" | "neutral"; text: string } | null;

function noticeFor(hint: string | null): Notice {
  if (hint === "retorno") return { tone: "neutral", text: "Você voltou do provedor. O status abaixo foi consultado agora na fonte." };
  if (hint === "expirado") return { tone: "warning", text: "O link de cadastro expirou ou já foi usado. Gere um novo para continuar." };
  return null;
}

export function PayoutAccountSection({
  accounts,
  hint = null,
}: {
  accounts: readonly SellerPayoutAccountView[];
  hint?: string | null;
}) {
  if (accounts.length === 0) return null;
  const notice = noticeFor(hint);

  return (
    <section
      id="recebimento"
      aria-labelledby="recebimento-title"
      className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/6 text-foreground/80">
          <IconBuildingBank size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="recebimento-title" className="text-base font-semibold text-foreground">
            Conta de recebimento
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Onde os repasses das suas vendas no Marketplace são depositados. Os dados bancários ficam
            somente no provedor de pagamentos; a Ryvano guarda apenas a referência e o status.
          </p>
        </div>
      </div>

      {notice ? (
        <p
          role="status"
          className={`mt-4 rounded-2xl border p-3 text-xs ${notice.tone === "warning" ? "theme-panel-warning" : "theme-panel-neutral"}`}
        >
          {notice.text}
        </p>
      ) : null}

      <ul className="mt-4 grid gap-3">
        {accounts.map((account) => (
          <li key={`${account.sellerType}:${account.sellerId}`}>
            <BeneficiaryCard account={account} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BeneficiaryCard({ account }: { account: SellerPayoutAccountView }) {
  const [onboardState, onboardAction] = useActionState<SellerPayoutActionState, FormData>(startSellerOnboardingAction, {});
  const [refreshState, refreshAction] = useActionState<SellerPayoutActionState, FormData>(refreshSellerPayoutStatusAction, {});
  const [dashboardState, dashboardAction] = useActionState<SellerPayoutActionState, FormData>(openSellerDashboardAction, {});

  const primary = sellerPayoutPrimaryAction(account.status);
  const message = onboardState.message ?? refreshState.message ?? dashboardState.message ?? null;
  const beneficiary = `${account.beneficiaryKind} · ${account.beneficiaryName}`;

  const hidden = (
    <>
      <input type="hidden" name="sellerType" value={account.sellerType} />
      <input type="hidden" name="sellerId" value={account.sellerId} />
    </>
  );

  return (
    <article
      data-testid="payout-account"
      data-seller-type={account.sellerType}
      data-status={account.status}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Beneficiário</p>
          <p className="truncate text-sm font-semibold text-foreground">{beneficiary}</p>
        </div>
        <StatusBadge tone={TONE[account.status]}>{SELLER_PAYOUT_STATUS_LABELS[account.status]}</StatusBadge>
      </div>

      <p className="mt-3 text-sm text-foreground/70">{DESCRIPTION[account.status]}</p>

      {account.status === "ACTION_REQUIRED" && account.requirementsDue > 0 ? (
        <p className="mt-1 text-xs text-foreground/55">
          {account.requirementsDue} {account.requirementsDue === 1 ? "pendência" : "pendências"} no provedor.
        </p>
      ) : null}
      {account.status === "VERIFIED" && account.verifiedAt ? (
        <p className="mt-1 text-xs text-foreground/55">
          Verificada em {new Date(account.verifiedAt).toLocaleDateString("pt-BR")}.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {primary.kind === "onboard" ? (
          <form action={onboardAction}>
            {hidden}
            <SubmitButton
              pendingLabel="Abrindo o provedor…"
              className="glass-button rounded-full px-4 py-2 text-sm font-semibold"
            >
              {primary.label}
            </SubmitButton>
          </form>
        ) : null}

        {account.status === "VERIFIED" ? (
          <form action={dashboardAction}>
            {hidden}
            <SubmitButton
              pendingLabel="Abrindo…"
              className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-foreground/85 hover:bg-white/10"
            >
              Ver detalhes no provedor
            </SubmitButton>
          </form>
        ) : null}

        {account.hasPayoutAccount ? (
          <form action={refreshAction}>
            {hidden}
            <SubmitButton
              pendingLabel="Consultando…"
              className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-foreground/85 hover:bg-white/10"
            >
              Atualizar status
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {message ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {message}
        </p>
      ) : null}
      {refreshState.ok ? (
        <p role="status" className="mt-3 text-xs text-foreground/60">
          Status consultado no provedor.
        </p>
      ) : null}
    </article>
  );
}
