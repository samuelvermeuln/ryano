import Link from "next/link";
import { IconBuildingCommunity, IconMapPin, IconUsers } from "@tabler/icons-react";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { buildNoIndexMetadata } from "@/server/seo";

export const metadata = buildNoIndexMetadata({
  title: "Encontrar escola — Ryvano",
  description: "Encontre e conecte-se a escolas esportivas na plataforma Ryvano.",
  path: "/app/escola",
});

export const dynamic = "force-dynamic";

export default async function DiscoverEscolaPage() {
  await requireOnboardedSession();

  const schools = isSchoolModuleEnabled()
    ? await prisma.school.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          logoUrl: true,
          city: true,
          state: true,
          sportTypes: true,
          _count: { select: { memberships: { where: { status: "ACTIVE" } } } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Encontrar uma escola"
        description="Conecte-se a uma escola esportiva e acesse treinos, avaliações e acompanhamento profissional."
      >
        {schools.length === 0 ? (
          <div className="py-16 text-center text-foreground/50">
            <IconBuildingCommunity size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhuma escola cadastrada ainda.</p>
            <p className="mt-1 text-xs text-foreground/38">
              Quer cadastrar sua escola?{" "}
              <Link href="/entrar" className="text-accent hover:underline">
                Acesse /entrar e escolha "Sou uma Escola"
              </Link>
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {schools.map((school) => (
              <li key={school.id}>
                <div className="glass rounded-[18px] p-4 flex flex-col gap-3 hover:bg-white/5 transition-colors h-full">
                  {/* Logo / Initial */}
                  <div className="flex items-center gap-3">
                    {school.logoUrl ? (
                      <img
                        src={school.logoUrl}
                        alt={school.name}
                        className="h-10 w-10 rounded-[10px] object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent/20 text-accent font-bold text-lg">
                        {school.name[0]}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold leading-tight">{school.name}</p>
                      {(school.city || school.state) && (
                        <p className="flex items-center gap-1 text-xs text-foreground/50 mt-0.5">
                          <IconMapPin size={11} />
                          {[school.city, school.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {school.description && (
                    <p className="text-sm text-foreground/65 leading-relaxed line-clamp-2">
                      {school.description}
                    </p>
                  )}

                  {/* Sport types */}
                  {school.sportTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {school.sportTypes.slice(0, 4).map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent/80 uppercase tracking-wide"
                        >
                          {s}
                        </span>
                      ))}
                      {school.sportTypes.length > 4 && (
                        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-foreground/40">
                          +{school.sportTypes.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <p className="flex items-center gap-1 text-xs text-foreground/45">
                      <IconUsers size={12} />
                      {school._count.memberships} membro{school._count.memberships !== 1 ? "s" : ""}
                    </p>
                    <Link
                      href={`/escola/${school.slug}`}
                      className="rounded-[10px] bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25 transition-colors"
                    >
                      Ver escola
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
