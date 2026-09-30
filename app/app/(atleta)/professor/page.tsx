import Link from "next/link";
import { IconUserCheck, IconBuildingCommunity } from "@tabler/icons-react";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { UserAvatar } from "@/components/user-avatar";
import { buildNoIndexMetadata } from "@/server/seo";

export const metadata = buildNoIndexMetadata({
  title: "Encontrar professor — Ryvano",
  description: "Encontre professores e treinadores na plataforma Ryvano.",
  path: "/app/professor",
});

export const dynamic = "force-dynamic";

export default async function DiscoverProfessorPage() {
  await requireOnboardedSession();

  const coaches = isSchoolModuleEnabled()
    ? await prisma.coachProfile.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          displayName: true,
          bio: true,
          user: { select: { image: true } },
          schoolMemberships: {
            where: { status: "ACTIVE" },
            select: { school: { select: { name: true, slug: true } } },
            take: 3,
          },
        },
        orderBy: { displayName: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Encontrar um professor"
        description="Encontre treinadores e professores cadastrados na plataforma para acompanhar sua evolução."
      >
        {coaches.length === 0 ? (
          <div className="py-16 text-center text-foreground/50">
            <IconUserCheck size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum professor cadastrado ainda.</p>
            <p className="mt-1 text-xs text-foreground/38">
              É professor e quer criar seu perfil?{" "}
              <Link href="/entrar" className="text-accent hover:underline">
                Acesse /entrar e escolha "Sou Professor"
              </Link>
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {coaches.map((coach) => (
              <li key={coach.id}>
                <div className="glass rounded-[18px] p-4 flex flex-col gap-3 hover:bg-white/5 transition-colors h-full">
                  {/* Avatar + name */}
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={coach.displayName}
                      image={coach.user.image}
                      size="md"
                    />
                    <p className="font-semibold leading-tight">{coach.displayName}</p>
                  </div>

                  {/* Bio */}
                  {coach.bio && (
                    <p className="text-sm text-foreground/65 leading-relaxed line-clamp-3">
                      {coach.bio}
                    </p>
                  )}

                  {/* Schools */}
                  {coach.schoolMemberships.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {coach.schoolMemberships.map(({ school }) => (
                        <Link
                          key={school.slug}
                          href={`/escola/${school.slug}`}
                          className="flex items-center gap-1.5 text-xs text-foreground/50 hover:text-foreground/80 transition-colors"
                        >
                          <IconBuildingCommunity size={12} />
                          {school.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
