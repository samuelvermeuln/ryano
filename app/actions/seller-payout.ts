"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/server/db";
import { getPublicAppUrl } from "@/server/env";
import { requireOnboardedSession } from "@/server/auth-guards";
import { SchoolError } from "@/modules/school/domain/errors";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { StartSellerOnboarding } from "@/modules/school/application/start-seller-onboarding";
import { SyncSellerAccountStatus } from "@/modules/school/application/sync-seller-account-status";
import { PROVIDER_NOT_CONFIGURED } from "@/modules/school/application/seller-onboarding-provider";
import { StripePaymentProvider } from "@/modules/school/infrastructure/stripe-payment-provider";
import { schoolLogger } from "@/modules/school/infrastructure/logger";

/**
 * SAM-13 — actions da seção "Conta de recebimento" do Perfil. Adaptadores
 * finos: sessão + parse + delegação. Autorização (dono da conta / OWNER-ADMIN
 * da escola) é do use case, nunca daqui. Nada de dado bancário passa por aqui:
 * o usuário é redirecionado ao onboarding hospedado do provedor.
 */
export type SellerPayoutActionState = { message?: string; ok?: boolean };

const beneficiarySchema = z.object({
  sellerType: z.enum(["COACH", "SCHOOL"]),
  sellerId: z.string().min(1).max(256),
});

const provider = new StripePaymentProvider();
const PERFIL_PAYOUT_PATH = "/app/perfil";

function toState(error: unknown): SellerPayoutActionState {
  if (error instanceof SchoolError) return { message: error.message };
  if (error instanceof z.ZodError) return { message: "Dados inválidos." };
  if (error instanceof Error && error.message === PROVIDER_NOT_CONFIGURED) {
    return { message: "O provedor de pagamentos não está configurado neste ambiente. Tente novamente mais tarde." };
  }
  return { message: "Não foi possível concluir a operação." };
}

function payoutReturnUrls() {
  const base = getPublicAppUrl();
  return {
    returnUrl: new URL(`${PERFIL_PAYOUT_PATH}?recebimento=retorno#recebimento`, base).toString(),
    refreshUrl: new URL(`${PERFIL_PAYOUT_PATH}?recebimento=expirado#recebimento`, base).toString(),
  };
}

/** Inicia/retoma o onboarding hospedado e redireciona o usuário para o provedor. */
export async function startSellerOnboardingAction(
  _prev: SellerPayoutActionState,
  formData: FormData,
): Promise<SellerPayoutActionState> {
  if (!isMarketplaceEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();
  const log = schoolLogger("seller-onboarding");

  let url: string;
  try {
    const parsed = beneficiarySchema.parse({ sellerType: formData.get("sellerType"), sellerId: formData.get("sellerId") });
    const result = await new StartSellerOnboarding(prisma, provider).execute(session.user.id, {
      ...parsed,
      ...payoutReturnUrls(),
    });
    url = result.url;
    log.info("seller_onboarding_link_created", { sellerType: parsed.sellerType });
  } catch (error) {
    const state = toState(error);
    log.warn("seller_onboarding_refused", { message: state.message });
    return state;
  }

  redirect(url);
}

/** Consulta o estado real no provedor e espelha na base (nunca marca verificada por conta própria). */
export async function refreshSellerPayoutStatusAction(
  _prev: SellerPayoutActionState,
  formData: FormData,
): Promise<SellerPayoutActionState> {
  if (!isMarketplaceEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  try {
    const parsed = beneficiarySchema.parse({ sellerType: formData.get("sellerType"), sellerId: formData.get("sellerId") });
    // A leitura só é permitida a quem pode configurar o beneficiário — mesma regra do onboarding.
    await new StartSellerOnboarding(prisma, provider).authorize(session.user.id, parsed);
    await new SyncSellerAccountStatus(prisma).refresh(provider, parsed.sellerType, parsed.sellerId);
  } catch (error) {
    return toState(error);
  }

  revalidatePath(PERFIL_PAYOUT_PATH);
  return { ok: true };
}

/** Link do painel do provedor (só faz sentido para conta já verificada). */
export async function openSellerDashboardAction(
  _prev: SellerPayoutActionState,
  formData: FormData,
): Promise<SellerPayoutActionState> {
  if (!isMarketplaceEnabled()) return { message: "Recurso indisponível." };
  const session = await requireOnboardedSession();

  let url: string;
  try {
    const parsed = beneficiarySchema.parse({ sellerType: formData.get("sellerType"), sellerId: formData.get("sellerId") });
    url = (await new StartSellerOnboarding(prisma, provider).dashboardLink(session.user.id, parsed)).url;
  } catch (error) {
    return toState(error);
  }

  redirect(url);
}
