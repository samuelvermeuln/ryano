import { SecurityExperience } from "@/components/profile/security-experience";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export default async function SecurityPage() {
  const session = await requireOnboardedSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  return <SecurityExperience hasPassword={Boolean(user.passwordHash)} whatsappVerified={Boolean(session.user.whatsappVerified)} />;
}
