"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateCoachProfileForm } from "./create-profile-form";

type SchoolMembership = {
  membershipId: string;
  membershipStatus: "PENDING" | "ACTIVE";
  school: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    status: string;
  };
};

type Profile = {
  id: string;
  displayName: string;
  bio: string | null;
  status: string;
  schools: SchoolMembership[];
};

export function CoachProfilePanel({ profile: initialProfile }: { profile: Profile | null }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(initialProfile);

  // After profile creation, refetch from server via router refresh
  function handleProfileCreated() {
    router.refresh();
  }

  // ── No profile yet: onboarding ────────────────────────────────────────────

  if (!profile) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Tornar-se professor</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Crie seu perfil de professor para prescrever treinos, avaliar atletas e se vincular a escolas.
          </p>
        </div>

        {/* Explicação dos dois modos */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="font-semibold text-sm">🏫 Vinculado a uma escola</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Solicite vínculo com uma escola e passe a gerenciar os atletas dessa escola. A escola aprova sua entrada.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <p className="font-semibold text-sm">👤 Coach independente</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Trabalhe sem escola. Convide atletas diretamente com um link pessoal e prescreva treinos individualmente.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold mb-4">Criar meu perfil de professor</h2>
          <CreateCoachProfileForm onCreated={handleProfileCreated} />
        </div>
      </div>
    );
  }

  // ── Profile exists: dashboard ─────────────────────────────────────────────

  const activeSchools = profile.schools.filter((s) => s.membershipStatus === "ACTIVE" && s.school.status === "ACTIVE");
  const pendingSchools = profile.schools.filter((s) => s.membershipStatus === "PENDING");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{profile.displayName}</h1>
          {profile.bio && (
            <p className="text-muted-foreground text-sm mt-1 max-w-lg">{profile.bio}</p>
          )}
        </div>
        <span className="shrink-0 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1 font-medium">
          Professor ativo
        </span>
      </div>

      {/* Escolas ativas */}
      {activeSchools.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Minhas escolas</h2>
          <ul className="space-y-2">
            {activeSchools.map(({ membershipId, school }) => (
              <li key={membershipId}>
                <Link
                  href={`/professor/${school.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:bg-muted transition-colors group"
                >
                  <div>
                    <p className="font-medium text-sm">{school.name}</p>
                    {(school.city || school.state) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[school.city, school.state].filter(Boolean).join(" — ")}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground text-sm group-hover:text-foreground transition-colors">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Solicitações pendentes */}
      {pendingSchools.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Aguardando aprovação</h2>
          <ul className="space-y-2">
            {pendingSchools.map(({ membershipId, school }) => (
              <li key={membershipId}
                className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
                <div>
                  <p className="font-medium text-sm">{school.name}</p>
                  {(school.city || school.state) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[school.city, school.state].filter(Boolean).join(" — ")}
                    </p>
                  )}
                </div>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">Pendente</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Ações rápidas */}
      <section className="grid sm:grid-cols-2 gap-3">
        <Link
          href="/professor/buscar-escola"
          className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5 hover:bg-muted transition-colors"
        >
          <span className="text-sm font-semibold">🏫 Vincular a uma escola</span>
          <span className="text-xs text-muted-foreground">Busque uma escola e solicite entrada como professor.</span>
        </Link>
        <Link
          href="/professor/independente"
          className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5 hover:bg-muted transition-colors"
        >
          <span className="text-sm font-semibold">👤 Coach independente</span>
          <span className="text-xs text-muted-foreground">Convide atletas diretamente com seu link pessoal.</span>
        </Link>
      </section>
    </div>
  );
}
