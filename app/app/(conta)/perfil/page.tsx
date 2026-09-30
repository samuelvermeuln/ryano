import { ProfileExperience } from "@/components/profile/profile-experience";
import { requireOnboardedSession } from "@/server/auth-guards";
import { decryptSecret, type EncryptedSecret } from "@/server/crypto/secret-vault";
import { prisma } from "@/server/db";

export default async function ProfilePage() {
  const session = await requireOnboardedSession();
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
  );
}
