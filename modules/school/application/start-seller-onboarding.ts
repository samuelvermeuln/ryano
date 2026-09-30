import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";
import { SchoolMembershipRepository } from "../infrastructure/school-membership-repository";
import { CanManageSchool } from "./can-manage-school";
import { PROVIDER_NOT_CONFIGURED, type SellerOnboardingProvider } from "./seller-onboarding-provider";

const idSchema = z.string().min(1).max(256).refine((value) => value.trim() === value);

export const sellerBeneficiarySchema = z.object({
  sellerType: z.enum(["COACH", "SCHOOL"]),
  sellerId: idSchema,
});

export const startSellerOnboardingSchema = sellerBeneficiarySchema.extend({
  returnUrl: z.string().url(),
  refreshUrl: z.string().url(),
}).strict();

export type SellerBeneficiaryInput = z.infer<typeof sellerBeneficiarySchema>;
export type StartSellerOnboardingInput = z.infer<typeof startSellerOnboardingSchema>;

/**
 * SAM-13 — inicia (ou retoma) o onboarding hospedado do provedor para um
 * beneficiário. Autorização no backend, sempre:
 *
 * - COACH: o `sellerId` tem de ser o `CoachProfile` ACTIVE do próprio usuário
 *   (um professor nunca configura a conta de outro professor).
 * - SCHOOL: OWNER/ADMIN da escola (`CanManageSchool`); membro comum não ganha
 *   acesso financeiro por pertencer à escola.
 *
 * A linha `SellerAccount` é criada/reaproveitada pela chave
 * (sellerType, sellerId, provider) — a mesma que o ledger já usa, então uma
 * venda registrada antes do onboarding e a conta configurada depois convergem
 * na mesma linha (o saldo pendente nunca se perde). A connected account é
 * criada uma única vez; links de onboarding são sempre novos (uso único).
 */
export class StartSellerOnboarding {
  private readonly canManageSchool: CanManageSchool;

  constructor(
    private readonly db: PrismaClient,
    private readonly provider: SellerOnboardingProvider,
  ) {
    this.canManageSchool = new CanManageSchool(new SchoolMembershipRepository(db));
  }

  async execute(actorUserId: string | null, raw: unknown): Promise<{ url: string }> {
    const input = startSellerOnboardingSchema.parse(raw);
    const beneficiary = await this.authorize(actorUserId, input);

    const provider = this.provider.providerId;
    const existing = await this.db.sellerAccount.findUnique({
      where: { sellerType_sellerId_provider: { sellerType: input.sellerType, sellerId: input.sellerId, provider } },
      select: { id: true, payoutAccountRef: true },
    });

    let accountRef = existing?.payoutAccountRef ?? null;
    try {
      if (!accountRef) {
        const created = await this.provider.createConnectedAccount({
          sellerType: input.sellerType,
          sellerId: input.sellerId,
          email: beneficiary.email,
          businessType: input.sellerType === "COACH" ? "individual" : "company",
          displayName: beneficiary.displayName,
        });
        accountRef = created.accountRef;
        await this.db.sellerAccount.upsert({
          where: { sellerType_sellerId_provider: { sellerType: input.sellerType, sellerId: input.sellerId, provider } },
          create: { sellerType: input.sellerType, sellerId: input.sellerId, provider, payoutAccountRef: accountRef },
          update: { payoutAccountRef: accountRef },
        });
      }

      return await this.provider.createOnboardingLink({
        accountRef,
        returnUrl: input.returnUrl,
        refreshUrl: input.refreshUrl,
      });
    } catch (error) {
      if (error instanceof Error && error.message === PROVIDER_NOT_CONFIGURED) {
        throw new SchoolError(
          "PAYMENT_PROVIDER_UNAVAILABLE",
          "O provedor de pagamentos não está configurado neste ambiente. Tente novamente mais tarde.",
          503,
        );
      }
      throw error;
    }
  }

  /** Link do painel do provedor para um beneficiário já conectado (mesma autorização do onboarding). */
  async dashboardLink(actorUserId: string | null, raw: unknown): Promise<{ url: string }> {
    const input = sellerBeneficiarySchema.parse(raw);
    await this.authorize(actorUserId, input);
    const row = await this.db.sellerAccount.findUnique({
      where: { sellerType_sellerId_provider: { sellerType: input.sellerType, sellerId: input.sellerId, provider: this.provider.providerId } },
      select: { payoutAccountRef: true },
    });
    if (!row?.payoutAccountRef) {
      throw new SchoolError("SELLER_ACCOUNT_NOT_CONFIGURED", "Conta de recebimento ainda não configurada.", 409);
    }
    try {
      return await this.provider.createDashboardLink(row.payoutAccountRef);
    } catch (error) {
      if (error instanceof Error && error.message === PROVIDER_NOT_CONFIGURED) {
        throw new SchoolError("PAYMENT_PROVIDER_UNAVAILABLE", "O provedor de pagamentos não está configurado neste ambiente.", 503);
      }
      throw error;
    }
  }

  /**
   * Quem pode configurar/consultar a conta deste beneficiário. Pública para
   * que a leitura de status (refresh) reutilize exatamente a mesma regra.
   */
  async authorize(actorUserId: string | null, input: SellerBeneficiaryInput) {
    if (!idSchema.safeParse(actorUserId).success) {
      throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    }
    if (input.sellerType === "COACH") {
      const coach = await this.db.coachProfile.findUnique({
        where: { userId: actorUserId! },
        select: { id: true, status: true, displayName: true, user: { select: { email: true } } },
      });
      if (!coach || coach.id !== input.sellerId) {
        throw new SchoolError("FORBIDDEN", "Você só pode configurar a sua própria conta de recebimento.", 403);
      }
      if (coach.status !== "ACTIVE") {
        throw new SchoolError("FORBIDDEN", "Perfil de professor inativo.", 403);
      }
      return { displayName: coach.displayName, email: coach.user.email ?? null };
    }

    await this.canManageSchool.assert(actorUserId, input.sellerId);
    const school = await this.db.school.findUnique({
      where: { id: input.sellerId },
      select: { name: true, email: true, status: true },
    });
    if (!school || school.status !== "ACTIVE") {
      throw new SchoolError("SCHOOL_NOT_FOUND", "Escola não encontrada.", 404);
    }
    return { displayName: school.name, email: school.email ?? null };
  }
}
