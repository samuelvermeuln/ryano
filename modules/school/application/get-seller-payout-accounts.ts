import type { PrismaClient } from "@prisma/client";
import {
  deriveSellerPayoutStatus,
  isSellerPayoutEligible,
  type SellerPayoutStatus,
} from "../domain/seller-account";

/**
 * SAM-13 — beneficiários que o usuário pode configurar no Perfil e o status
 * da conta de recebimento de cada um.
 *
 * - Professor: o próprio `CoachProfile` ACTIVE (a conta é do professor).
 * - Escola: cada escola ACTIVE em que o usuário é OWNER/ADMIN (a conta é da
 *   escola, nunca do administrador que cadastrou).
 * - Atleta / membro comum: lista vazia — a seção nem aparece.
 *
 * A elegibilidade é recalculada aqui a cada leitura (relações reais), nunca
 * herdada de cookie/sessão.
 */
export interface SellerPayoutAccountView {
  sellerType: "COACH" | "SCHOOL";
  sellerId: string;
  /** "Professor" | "Escola" */
  beneficiaryKind: string;
  /** Nome exibido do beneficiário (displayName do coach / nome da escola). */
  beneficiaryName: string;
  provider: string | null;
  status: SellerPayoutStatus;
  payoutEligible: boolean;
  hasPayoutAccount: boolean;
  requirementsDue: number;
  verifiedAt: string | null;
  providerSyncedAt: string | null;
}

export class GetSellerPayoutAccounts {
  constructor(private readonly db: PrismaClient) {}

  async execute(actorUserId: string): Promise<SellerPayoutAccountView[]> {
    const [coachProfile, adminMemberships] = await Promise.all([
      this.db.coachProfile.findUnique({
        where: { userId: actorUserId },
        select: { id: true, displayName: true, status: true },
      }),
      this.db.schoolMembership.findMany({
        where: {
          userId: actorUserId,
          status: "ACTIVE",
          endedAt: null,
          school: { status: "ACTIVE" },
          roles: { some: { role: { in: ["OWNER", "ADMIN"] } } },
        },
        select: { schoolId: true, school: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const beneficiaries: Array<Pick<SellerPayoutAccountView, "sellerType" | "sellerId" | "beneficiaryKind" | "beneficiaryName">> = [];
    if (coachProfile && coachProfile.status === "ACTIVE") {
      beneficiaries.push({ sellerType: "COACH", sellerId: coachProfile.id, beneficiaryKind: "Professor", beneficiaryName: coachProfile.displayName });
    }
    for (const membership of adminMemberships) {
      beneficiaries.push({ sellerType: "SCHOOL", sellerId: membership.schoolId, beneficiaryKind: "Escola", beneficiaryName: membership.school.name });
    }
    if (beneficiaries.length === 0) return [];

    const accounts = await this.db.sellerAccount.findMany({
      where: { OR: beneficiaries.map((b) => ({ sellerType: b.sellerType, sellerId: b.sellerId })) },
      select: {
        sellerType: true,
        sellerId: true,
        provider: true,
        payoutAccountRef: true,
        kycStatus: true,
        detailsSubmitted: true,
        payoutsEnabled: true,
        requirementsDue: true,
        disabledReason: true,
        verifiedAt: true,
        providerSyncedAt: true,
      },
    });

    return beneficiaries.map((beneficiary) => {
      const account = accounts.find((a) => a.sellerType === beneficiary.sellerType && a.sellerId === beneficiary.sellerId) ?? null;
      const state = account
        ? {
            payoutAccountRef: account.payoutAccountRef,
            kycStatus: account.kycStatus,
            detailsSubmitted: account.detailsSubmitted,
            payoutsEnabled: account.payoutsEnabled,
            requirementsDue: account.requirementsDue,
            disabledReason: account.disabledReason,
          }
        : null;
      return {
        ...beneficiary,
        provider: account?.provider ?? null,
        status: deriveSellerPayoutStatus(state),
        payoutEligible: isSellerPayoutEligible(state),
        hasPayoutAccount: Boolean(account?.payoutAccountRef),
        requirementsDue: account?.requirementsDue ?? 0,
        verifiedAt: account?.verifiedAt?.toISOString() ?? null,
        providerSyncedAt: account?.providerSyncedAt?.toISOString() ?? null,
      };
    });
  }
}
