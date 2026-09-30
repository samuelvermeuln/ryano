/**
 * SAM-13 — conta de recebimento (SellerAccount) como estado de domínio.
 *
 * O provedor financeiro (Stripe Connect) é a fonte de verdade da verificação:
 * a Ryvano só espelha o que o provedor informa (webhook `account.updated` ou
 * consulta ao voltar do onboarding). Nada aqui marca uma conta como
 * verificada a partir de um formulário preenchido na UI.
 *
 * Este módulo é puro e provider-agnóstico: recebe uma projeção
 * (`ProviderConnectedAccount`) que a infraestrutura monta a partir do objeto
 * do provedor, e deriva o status apresentado no Perfil.
 */

export type SellerKycStatus = "PENDING" | "VERIFIED" | "REJECTED";

/** Projeção provider-agnóstica de uma connected account (campos que o domínio precisa). */
export interface ProviderConnectedAccount {
  accountRef: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** Requisitos pendentes do provedor (currently_due + past_due). */
  requirementsDue: readonly string[];
  /** `requirements.disabled_reason` do provedor, quando a conta está desabilitada. */
  disabledReason: string | null;
}

/** Subconjunto persistido de `SellerAccount` que o status depende. */
export interface SellerAccountState {
  payoutAccountRef: string | null;
  kycStatus: SellerKycStatus;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  requirementsDue: number;
  disabledReason: string | null;
}

/**
 * Estados apresentados ao usuário. Mapeiam os estados reais do provedor
 * (details_submitted / requirements / payouts_enabled / disabled_reason) —
 * não são inventados.
 */
export type SellerPayoutStatus =
  | "NOT_CONFIGURED"
  | "ONBOARDING_STARTED"
  | "PENDING_VERIFICATION"
  | "ACTION_REQUIRED"
  | "VERIFIED"
  | "BLOCKED";

export const SELLER_PAYOUT_STATUS_LABELS: Record<SellerPayoutStatus, string> = {
  NOT_CONFIGURED: "Não configurada",
  ONBOARDING_STARTED: "Cadastro iniciado",
  PENDING_VERIFICATION: "Aguardando verificação",
  ACTION_REQUIRED: "Ação necessária",
  VERIFIED: "Verificada",
  BLOCKED: "Bloqueada",
};

/** Motivos do provedor que significam recusa definitiva (Stripe: `rejected.*`). */
function isRejectedReason(reason: string | null) {
  return Boolean(reason && reason.startsWith("rejected"));
}

/**
 * Converte a projeção do provedor no estado persistido. VERIFIED exige que o
 * provedor tenha liberado repasses; REJECTED só quando o provedor recusou.
 */
export function mapProviderAccountToSellerState(
  account: ProviderConnectedAccount,
): Omit<SellerAccountState, "payoutAccountRef"> {
  const kycStatus: SellerKycStatus = isRejectedReason(account.disabledReason)
    ? "REJECTED"
    : account.payoutsEnabled && account.chargesEnabled
      ? "VERIFIED"
      : "PENDING";

  return {
    kycStatus,
    detailsSubmitted: account.detailsSubmitted,
    payoutsEnabled: account.payoutsEnabled,
    requirementsDue: account.requirementsDue.length,
    disabledReason: account.disabledReason,
  };
}

export function deriveSellerPayoutStatus(state: SellerAccountState | null): SellerPayoutStatus {
  if (!state || !state.payoutAccountRef) return "NOT_CONFIGURED";
  if (state.kycStatus === "REJECTED") return "BLOCKED";
  if (state.kycStatus === "VERIFIED" && state.payoutsEnabled) return "VERIFIED";
  if (!state.detailsSubmitted) return "ONBOARDING_STARTED";
  if (state.requirementsDue > 0 || state.disabledReason) return "ACTION_REQUIRED";
  return "PENDING_VERIFICATION";
}

/**
 * Elegibilidade para repasse. Única regra que um futuro job de payout deve
 * consultar: verificada pelo provedor E com repasses habilitados. Vendas
 * continuam sendo registradas no ledger independentemente disto.
 */
export function isSellerPayoutEligible(state: SellerAccountState | null): boolean {
  return deriveSellerPayoutStatus(state) === "VERIFIED";
}

/** Ação principal oferecida ao beneficiário conforme o status. */
export function sellerPayoutPrimaryAction(status: SellerPayoutStatus): { label: string; kind: "onboard" | "refresh" | "none" } {
  switch (status) {
    case "NOT_CONFIGURED":
      return { label: "Cadastrar conta de recebimento", kind: "onboard" };
    case "ONBOARDING_STARTED":
      return { label: "Continuar cadastro", kind: "onboard" };
    case "ACTION_REQUIRED":
      return { label: "Resolver pendências", kind: "onboard" };
    case "PENDING_VERIFICATION":
      return { label: "Atualizar status", kind: "refresh" };
    case "VERIFIED":
      return { label: "Atualizar dados", kind: "onboard" };
    case "BLOCKED":
      return { label: "Atualizar status", kind: "refresh" };
  }
}
