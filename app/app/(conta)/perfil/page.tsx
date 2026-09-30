import { PayoutAccountSection } from "@/components/profile/payout-account-section";
import { ProfileExperience } from "@/components/profile/profile-experience";
import { GetSellerPayoutAccounts, type SellerPayoutAccountView } from "@/modules/school/application/get-seller-payout-accounts";
import { SyncSellerAccountStatus } from "@/modules/school/application/sync-seller-account-status";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import { StripePaymentProvider } from "@/modules/school/infrastructure/stripe-payment-provider";
import { requireOnboardedSession } from "@/server/auth-guards";
import { decryptSecret, type EncryptedSecret } from "@/server/crypto/secret-vault";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * SAM-13 — contas de recebimento do usuário (Professor / Escola). Ao voltar do
 * onboarding hospedado (`?recebimento=retorno`) o estado real é consultado no
 * provedor ANTES de renderizar: a volta ao return_url não significa que o
 * cadastro terminou, então "Verificada" só aparece se o provedor confirmar.
 */
async function loadPayoutAccounts(userId: string, hint: string | null): Promise<SellerPayoutAccountView[]> {
  if (!isMarketplaceEnabled()) return [];
  const reader = new GetSellerPayoutAccounts(prisma);
  let accounts = await reader.execute(userId);

  if (hint === "retorno" && accounts.some((account) => account.hasPayoutAccount)) {
    const provider = new StripePaymentProvider();
    const sync = new SyncSellerAccountStatus(prisma);
    await Promise.all(
      accounts
        .filter((account) => account.hasPayoutAccount)
        // Falha na consulta não derruba o Perfil: o status espelhado continua valendo.
        .map((account) => sync.refresh(provider, account.sellerType, account.sellerId).catch(() => null)),
    );
    accounts = await reader.execute(userId);
  }

  return accounts;
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ recebimento?: string }>;
}) {
  const session = await requireOnboardedSession();
  const { recebimento } = await searchParams;
  const payoutHint = recebimento === "retorno" || recebimento === "expirado" ? recebimento : null;
  const payoutAccounts = await loadPayoutAccounts(session.user.id, payoutHint);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      address: {
        select: {
          postalCode: true,
          street: true,
          number: true,
          complement: true,
          district: true,
          city: true,
          state: true,
          country: true,
        },
      },
      profile: {
        select: {
          cpfEncrypted: true,
          phoneE164: true,
          heightCm: true,
          weightKg: true,
        },
      },
      whatsappIdentity: {
        select: {
          verifiedAt: true,
        },
      },
      notificationPreference: {
        select: {
          postActivityReport: true,
          dailySummary: true,
          weeklySummary: true,
        },
      },
      wearableConnections: {
        where: {
          provider: "GARMIN",
        },
        select: {
          status: true,
        },
      },
    },
  });
  const cpf = user.profile?.cpfEncrypted
    ? decryptSecret(JSON.parse(user.profile.cpfEncrypted) as EncryptedSecret)
    : null;

  return (
    <>
    <ProfileExperience
      key={[
        user.name,
        user.image,
        user.profile?.heightCm,
        user.profile?.weightKg,
        user.address?.postalCode,
        user.address?.number,
        user.address?.complement,
      ].join(":")}
      user={{
        name: user.name ?? session.user.name ?? session.user.email ?? "Usuário",
        email: user.email,
        image: user.image,
        cpf,
        phone: user.profile?.phoneE164 ?? null,
        heightCm: user.profile?.heightCm ?? null,
        weightKg: user.profile?.weightKg?.toString() ?? null,
        postalCode: user.address?.postalCode ?? null,
        number: user.address?.number ?? null,
        complement: user.address?.complement ?? null,
        address: {
          street: user.address?.street ?? null,
          district: user.address?.district ?? null,
          city: user.address?.city ?? null,
          state: user.address?.state ?? null,
          country: user.address?.country ?? null,
        },
        whatsappVerified: Boolean(user.whatsappIdentity?.verifiedAt),
        garminStatus: user.wearableConnections[0]?.status ?? null,
        notificationPreference: user.notificationPreference
          ? {
              postActivityReport: user.notificationPreference.postActivityReport,
              dailySummary: user.notificationPreference.dailySummary,
              weeklySummary: user.notificationPreference.weeklySummary,
            }
          : null,
      }}
    />
    <PayoutAccountSection accounts={payoutAccounts} hint={payoutHint} />
    </>
  );
}
