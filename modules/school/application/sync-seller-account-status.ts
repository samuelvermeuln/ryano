import type { PrismaClient } from "@prisma/client";
import { mapProviderAccountToSellerState, type ProviderConnectedAccount } from "../domain/seller-account";
import type { SellerOnboardingProvider } from "./seller-onboarding-provider";

/**
 * SAM-13 — espelha o estado de verificação vindo do provedor na linha
 * `SellerAccount`. É o ÚNICO caminho que muda `kycStatus`: nem UI nem action
 * de formulário escrevem esse campo.
 *
 * Duas portas de entrada, mesma escrita:
 * - `applyProviderAccount`: evento `account.updated` do webhook;
 * - `refresh`: consulta ativa ao provedor (retorno do onboarding, botão
 *   "Atualizar status").
 *
 * Idempotente: reaplicar o mesmo estado não muda nada além de `providerSyncedAt`.
 * Uma connected account desconhecida (não é nossa) é ignorada e reportada.
 */
export class SyncSellerAccountStatus {
  constructor(private readonly db: PrismaClient) {}

  async applyProviderAccount(provider: string, account: ProviderConnectedAccount) {
    const row = await this.db.sellerAccount.findFirst({
      where: { provider, payoutAccountRef: account.accountRef },
      select: { id: true, verifiedAt: true },
    });
    if (!row) return { applied: false as const, reason: "unknown_account" as const };

    const state = mapProviderAccountToSellerState(account);
    const now = new Date();
    const updated = await this.db.sellerAccount.update({
      where: { id: row.id },
      data: {
        ...state,
        providerSyncedAt: now,
        // Registra a primeira verificação; não regride se o provedor pausar depois.
        verifiedAt: state.kycStatus === "VERIFIED" ? (row.verifiedAt ?? now) : row.verifiedAt,
      },
      select: { id: true, sellerType: true, sellerId: true, kycStatus: true, payoutsEnabled: true, requirementsDue: true },
    });
    return { applied: true as const, account: updated };
  }

  /** Lê o estado real no provedor e aplica. Sem `payoutAccountRef` não há o que consultar. */
  async refresh(provider: SellerOnboardingProvider, sellerType: "COACH" | "SCHOOL", sellerId: string) {
    const row = await this.db.sellerAccount.findUnique({
      where: { sellerType_sellerId_provider: { sellerType, sellerId, provider: provider.providerId } },
      select: { payoutAccountRef: true },
    });
    if (!row?.payoutAccountRef) return { applied: false as const, reason: "not_configured" as const };

    const account = await provider.retrieveConnectedAccount(row.payoutAccountRef);
    return this.applyProviderAccount(provider.providerId, account);
  }
}
