"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { AuthAccessPanel } from "@/components/auth/auth-access-panel";
import { AuthLegal } from "@/components/auth/auth-legal";
import { ThemeToggle, ThemedWordmark } from "@/components/theme-toggle";
import { AuroraBackground } from "@/components/aurora-background";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = "aluno" | "professor" | "escola";
type AuthMode = "login" | "signup";

type EntrarClientProps = {
  googleEnabled: boolean;
  initialMode: AuthMode;
  createdAccount: boolean;
  passwordChanged: boolean;
  authError?: string | null;
  loginHintMessage?: string | null;
  /**
   * TM037 (RF-107) — set only when the server already validated an internal
   * `/marketplace/...` return path (see `getSafeMarketplaceCallback` in
   * `page.tsx`). Never re-validated client-side — this component treats it
   * as already-safe and only ever displays/forwards it, never re-derives it
   * from raw user input.
   */
  buyerCallbackUrl?: string | null;
};

/** For Google OAuth we use /entrar?next=<role> so the redirect lands on /entrar
 *  (the configured signIn page — always trusted by NextAuth) and the server then
 *  bounces the authenticated user to the right place. For credentials the direct
 *  callbackUrl works fine since there is no external OAuth round-trip. */
function googleCallbackUrl(roleCallbackUrl: string): string {
  return `/entrar?next=${encodeURIComponent(roleCallbackUrl)}`;
}

// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------

const ROLES = [
  {
    id: "aluno" as Role,
    label: "Sou Aluno",
    sublabel: "Encontre sua escola e acompanhe seus treinos",
    emoji: "🏊",
    /** After login/signup, redirect here */
    callbackUrl: "/app/dashboard",
    accentClass: "from-sky-400/20 to-cyan-400/10",
    borderClass: "border-sky-400/25 hover:border-sky-400/60",
    glowClass: "shadow-[0_0_40px_oklch(0.72_0.15_220_/_0.25)]",
    dotClass: "bg-sky-400",
    textClass: "text-sky-300",
    badgeBg: "bg-sky-400/10 border-sky-400/25 text-sky-300",
    sports: ["🏊", "🏃", "🚴", "🏋️", "⚽", "🎾", "🤸", "🧘"],
    features: [
      { icon: "🔍", title: "Encontre sua escola", desc: "Busque por modalidade ou localização e solicite matrícula" },
      { icon: "📅", title: "Calendário de treinos", desc: "Veja o plano semanal de todas as suas modalidades" },
      { icon: "⌚", title: "Envie ao relógio", desc: "Sincronize treinos estruturados direto no seu Garmin" },
      { icon: "📈", title: "Acompanhe sua evolução", desc: "Feedback pós-treino e gráficos de progresso" },
    ],
    loginTitle: "Bem-vindo de volta, atleta",
    loginDesc: "Continue de onde parou e confira os treinos de hoje.",
    signupTitle: "Comece sua jornada",
    signupDesc: "Crie sua conta para entrar na sua escola e receber treinos.",
  },
  {
    id: "professor" as Role,
    label: "Sou Professor",
    sublabel: "Gerencie seus atletas e prescreva treinos",
    emoji: "🎯",
    callbackUrl: "/professor",
    accentClass: "from-violet-400/20 to-purple-400/10",
    borderClass: "border-violet-400/25 hover:border-violet-400/60",
    glowClass: "shadow-[0_0_40px_oklch(0.65_0.2_300_/_0.25)]",
    dotClass: "bg-violet-400",
    textClass: "text-violet-300",
    badgeBg: "bg-violet-400/10 border-violet-400/25 text-violet-300",
    sports: ["🎯", "📋", "🏅", "⏱️", "📊", "💪", "🧠", "🗓️"],
    features: [
      { icon: "📋", title: "Prescrição de treinos", desc: "Monte blocos com alvos de FC, pace e potência" },
      { icon: "👥", title: "Painel de atletas", desc: "Acompanhe todos seus alunos em tempo real" },
      { icon: "📊", title: "Análise de desempenho", desc: "Relatórios automáticos pós-atividade com IA" },
      { icon: "🏫", title: "Vincule-se a uma escola", desc: "Trabalhe em uma ou mais escolas simultaneamente" },
    ],
    loginTitle: "Bem-vindo, professor",
    loginDesc: "Acesse o painel e veja os treinos de hoje dos seus alunos.",
    signupTitle: "Crie seu perfil de coach",
    signupDesc: "Cadastre-se e comece a gerenciar seus atletas.",
  },
  {
    id: "escola" as Role,
    label: "Sou uma Escola",
    sublabel: "Administre modalidades, professores e alunos",
    emoji: "🏫",
    callbackUrl: "/escola",
    accentClass: "from-emerald-400/20 to-teal-400/10",
    borderClass: "border-emerald-400/25 hover:border-emerald-400/60",
    glowClass: "shadow-[0_0_40px_oklch(0.75_0.16_165_/_0.25)]",
    dotClass: "bg-emerald-400",
    textClass: "text-emerald-300",
    badgeBg: "bg-emerald-400/10 border-emerald-400/25 text-emerald-300",
    sports: ["🏫", "🏊", "⚽", "🎾", "🏋️", "🤸", "🚴", "🏃"],
    features: [
      { icon: "🏫", title: "Cadastre sua escola", desc: "Registre CNPJ, modalidades e estruture sua equipe" },
      { icon: "👨🏫", title: "Gerencie professores", desc: "Convide coaches e defina modalidades por professor" },
      { icon: "📋", title: "Controle matrículas", desc: "Aprove alunos, monitore vínculos e histórico" },
      { icon: "📊", title: "Relatórios gerenciais", desc: "Visão completa da escola com dados em tempo real" },
    ],
    loginTitle: "Bem-vindo, gestor",
    loginDesc: "Acesse o painel da sua escola e gerencie professores e alunos.",
    signupTitle: "Cadastre sua escola",
    signupDesc: "Registre sua escola e comece a receber alunos e professores.",
  },
] as const;

// ---------------------------------------------------------------------------
// Floating sport emojis (deterministic, not random)
// ---------------------------------------------------------------------------

const FLOAT_POSITIONS = [
  { top: "8%", left: "4%", delay: "0s", duration: "6.2s", scale: 1.1 },
  { top: "18%", right: "6%", delay: "1.1s", duration: "7.4s", scale: 0.85 },
  { top: "42%", left: "2%", delay: "2.3s", duration: "5.8s", scale: 0.9 },
  { top: "64%", left: "8%", delay: "0.6s", duration: "8.1s", scale: 1.0 },
  { top: "78%", right: "3%", delay: "1.8s", duration: "6.7s", scale: 1.15 },
  { top: "30%", right: "2%", delay: "3.0s", duration: "7.0s", scale: 0.8 },
  { top: "55%", right: "8%", delay: "0.4s", duration: "9.2s", scale: 0.95 },
  { top: "90%", left: "14%", delay: "2.0s", duration: "5.5s", scale: 1.05 },
];

function FloatingEmojis({ sports }: { sports: readonly string[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {FLOAT_POSITIONS.map((pos, i) => (
        <span
          key={i}
          className="absolute text-2xl opacity-15 select-none"
          style={{
            top: pos.top,
            left: "left" in pos ? pos.left : undefined,
            right: "right" in pos ? (pos as { right: string }).right : undefined,
            fontSize: `${1.4 * pos.scale}rem`,
            animation: `entrar-float ${pos.duration} ease-in-out ${pos.delay} infinite`,
          }}
        >
          {sports[i % sports.length]}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role card (role picker step)
// ---------------------------------------------------------------------------

function RoleCard({
  role,
  index,
  onSelect,
}: {
  role: (typeof ROLES)[number];
  index: number;
  onSelect: (role: (typeof ROLES)[number]) => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(role)}
      className={`group relative w-full overflow-hidden rounded-[24px] border bg-gradient-to-br p-6 text-left transition-shadow duration-300 ${role.accentClass} ${role.borderClass}`}
    >
      {/* Glow on hover */}
      <div className={`pointer-events-none absolute inset-0 rounded-[24px] opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${role.glowClass}`} />

      {/* Sport emojis background */}
      <div className="pointer-events-none absolute inset-0 flex flex-wrap gap-3 p-4 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        {role.sports.slice(0, 6).map((s, i) => (
          <span key={i} className="text-xl opacity-20" style={{ animationDelay: `${i * 0.1}s` }}>{s}</span>
        ))}
      </div>

      <div className="relative flex items-center gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-gradient-to-br text-2xl ${role.accentClass} ${role.borderClass}`}>
          {role.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`mb-1 text-base font-semibold text-foreground`}>{role.label}</div>
          <div className="text-sm leading-5 text-foreground/58">{role.sublabel}</div>
        </div>
        <div className={`ml-2 shrink-0 text-lg opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 ${role.textClass}`}>
          →
        </div>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Left panel — contextual features per role
// ---------------------------------------------------------------------------

function LeftPanel({ role }: { role: (typeof ROLES)[number] | null }) {
  const isChooser = role === null;

  return (
    <section className="hidden max-w-xl space-y-8 lg:block">
      <motion.div
        key={isChooser ? "chooser" : role!.id}
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-6"
      >
        {isChooser ? (
          <>
            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-accent">
              Plataforma Esportiva
            </span>
            <div className="space-y-4">
              <h1 className="text-5xl font-semibold tracking-tight text-foreground leading-[1.12]">
                Uma plataforma para toda a{" "}
                <span className="bg-gradient-to-r from-sky-300 via-accent to-emerald-300 bg-clip-text text-transparent">
                  escola esportiva
                </span>
              </h1>
              <p className="max-w-lg text-lg leading-8 text-foreground/68">
                Alunos, professores e escolas em um só lugar. Treinos prescritos, acompanhados e enviados ao relógio.
              </p>
            </div>

            {/* Sport pills marquee */}
            <div className="overflow-hidden">
              <motion.div
                animate={{ x: [0, -320] }}
                transition={{ duration: 18, ease: "linear", repeat: Infinity }}
                className="flex gap-3 whitespace-nowrap"
              >
                {["🏊 Natação", "🏃 Corrida", "🚴 Ciclismo", "🏋️ Musculação", "⚽ Futebol", "🎾 Tênis", "🤸 Ginástica", "🧘 Yoga", "🏊 Natação", "🏃 Corrida", "🚴 Ciclismo", "🏋️ Musculação"].map((sport, i) => (
                  <span key={i} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-foreground/70">
                    {sport}
                  </span>
                ))}
              </motion.div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 pt-2">
              {[
                { value: "12+", label: "Modalidades" },
                { value: "100%", label: "Integrado" },
                { value: "⌚", label: "Garmin & mais" },
              ].map((stat) => (
                <div key={stat.label} className="glass rounded-2xl p-4 text-center">
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="mt-1 text-xs text-foreground/55">{stat.label}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Role-specific left panel */}
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] ${role!.badgeBg}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${role!.dotClass}`} />
                {role!.label}
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-5xl font-semibold tracking-tight text-foreground leading-[1.12]">
                Seu espaço{" "}
                <span className={`bg-gradient-to-r ${role!.id === "aluno" ? "from-sky-300 to-cyan-300" : role!.id === "professor" ? "from-violet-300 to-purple-300" : "from-emerald-300 to-teal-300"} bg-clip-text text-transparent`}>
                  no esporte
                </span>
              </h1>
              <p className="max-w-lg text-lg leading-8 text-foreground/68">
                {role!.id === "aluno"
                  ? "Encontre sua escola, receba treinos do seu professor e acompanhe cada resultado."
                  : role!.id === "professor"
                  ? "Prescreva treinos estruturados, acompanhe seus atletas e automatize relatórios pós-treino."
                  : "Gerencie professores, alunos e modalidades com total controle e visibilidade em tempo real."}
              </p>
            </div>

            <div className="grid gap-3 pt-2">
              {role!.features.map((feature, i) => (
                <motion.article
                  key={feature.title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="glass rounded-[20px] p-4 transition duration-300 hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br text-lg ${role!.accentClass} ${role!.borderClass}`}>
                      {feature.icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{feature.title}</div>
                      <div className="text-xs leading-5 text-foreground/58">{feature.desc}</div>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Right panel — role picker or auth form
// ---------------------------------------------------------------------------

function RightPanel({
  role,
  googleEnabled,
  createdAccount,
  passwordChanged,
  authError,
  loginHintMessage,
  buyerCallbackUrl,
  onSelectRole,
  onBack,
}: {
  role: (typeof ROLES)[number] | null;
  googleEnabled: boolean;
  createdAccount: boolean;
  passwordChanged: boolean;
  authError?: string | null;
  loginHintMessage?: string | null;
  buyerCallbackUrl?: string | null;
  onSelectRole: (role: (typeof ROLES)[number]) => void;
  onBack: () => void;
}) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  function handleSelectRole(r: (typeof ROLES)[number]) {
    setAuthMode("login");
    onSelectRole(r);
  }

  return (
    <section className="glass w-full max-w-[460px] justify-self-center rounded-[28px] p-6 sm:p-8 lg:justify-self-end">
      <AnimatePresence mode="wait" initial={false}>
        {role === null ? (
          <motion.div
            key="chooser"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            {/* Mobile title */}
            <div className="space-y-2 lg:hidden">
              <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
                Plataforma Esportiva
              </span>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Escolha como entrar
              </h1>
              <p className="text-sm leading-7 text-foreground/68">
                Selecione seu perfil para continuar com a experiência certa.
              </p>
            </div>

            <div className="hidden lg:block space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Como você quer entrar?
              </h2>
              <p className="text-sm text-foreground/58">
                Selecione seu perfil para ver a experiência certa pra você.
              </p>
            </div>

            <div className="space-y-3">
              {ROLES.map((r, i) => (
                <RoleCard
                  key={r.id}
                  role={r}
                  index={i}
                  onSelect={handleSelectRole}
                />
              ))}
            </div>

            <p className="text-center text-xs text-foreground/40">
              Todos os perfis compartilham a mesma conta Ryvano.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={role.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            {/* Back + role badge */}
            <div className="flex items-center justify-between">
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-sm text-foreground/55 transition hover:text-foreground"
              >
                <span>←</span>
                <span>Voltar</span>
              </button>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${role.badgeBg}`}>
                <span>{role.emoji}</span>
                {role.label}
              </span>
            </div>

            {/* Contextual header inside auth panel (mobile only) */}
            <div className="space-y-1 lg:hidden">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {authMode === "login" ? role.loginTitle : role.signupTitle}
              </h2>
              <p className="text-sm leading-6 text-foreground/60">
                {authMode === "login" ? role.loginDesc : role.signupDesc}
              </p>
            </div>

            <AuthAccessPanel
              googleEnabled={googleEnabled}
              initialMode={authMode}
              createdAccount={createdAccount}
              passwordChanged={passwordChanged}
              authError={authError}
              loginHintMessage={loginHintMessage}
              // TM037 (RF-107) — a marketplace buyer is always an "aluno"
              // (athlete) action; when the server already validated an
              // internal `/marketplace/...` return path
              // (`getSafeMarketplaceCallback`/`isSafeMarketplaceCallbackPath`
              // in page.tsx), it overrides this role's default
              // `/app/dashboard` destination so credentials/Google login
              // lands back on the exact product page instead. This
              // component never re-derives `buyerCallbackUrl` from raw
              // input — it only chooses between two already-safe strings.
              callbackUrl={role.id === "aluno" && buyerCallbackUrl ? buyerCallbackUrl : role.callbackUrl}
              googleCallbackUrl={googleCallbackUrl(role.id === "aluno" && buyerCallbackUrl ? buyerCallbackUrl : role.callbackUrl)}
            />

            {role.id === "escola" ? (
              <div className="mt-2 rounded-[14px] border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-foreground/68">
                <span className="text-emerald-300 font-medium">Primeira vez?</span>{" "}
                <span className="text-foreground/60">Crie uma conta acima e cadastre sua escola após o primeiro acesso.</span>
              </div>
            ) : role.id === "professor" ? (
              <div className="mt-2 rounded-[14px] border border-violet-400/20 bg-violet-400/5 px-4 py-3 text-sm text-foreground/68">
                <span className="text-violet-300 font-medium">Após entrar</span>{" "}
                <span className="text-foreground/60">você será levado ao seu painel de professor para criar seu perfil ou ver seus atletas.</span>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function EntrarClient({
  googleEnabled,
  initialMode,
  createdAccount,
  passwordChanged,
  authError,
  loginHintMessage,
  buyerCallbackUrl,
}: EntrarClientProps) {
  // TM037 (RF-107) — a validated marketplace return path means the visitor
  // is unambiguously here to buy, so skip the role picker and go straight
  // to the "aluno" (athlete) auth form instead of making them re-select a
  // role they already implied by clicking "Comprar"/"Adquirir grátis".
  const [role, setRole] = useState<(typeof ROLES)[number] | null>(
    buyerCallbackUrl ? (ROLES.find((r) => r.id === "aluno") ?? null) : null,
  );

  return (
    <>
      {/* Float animation keyframe */}
      <style>{`
        @keyframes entrar-float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-10px) rotate(4deg); }
          66% { transform: translateY(5px) rotate(-3deg); }
        }
      `}</style>

      <AuroraBackground className="relative min-h-screen px-4 py-6 sm:px-6 lg:px-8">
        {/* Floating sport emojis — behind everything */}
        <FloatingEmojis sports={role ? role.sports : ["🏊", "🏃", "🚴", "🏋️", "⚽", "🎾", "🤸", "🧘"]} />

        <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col gap-8">
          {/* Header */}
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="min-w-0">
              <ThemedWordmark compact />
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link
                href="/"
                className="text-sm text-foreground/64 transition hover:text-foreground"
              >
                Voltar ao início
              </Link>
            </div>
          </header>

          {/* Main grid */}
          <main className="grid flex-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-12">
            {/* Left — contextual */}
            <AnimatePresence mode="wait" initial={false}>
              <LeftPanel key={role?.id ?? "chooser"} role={role} />
            </AnimatePresence>

            {/* Right — role picker → auth */}
            <RightPanel
              role={role}
              googleEnabled={googleEnabled}
              createdAccount={createdAccount}
              passwordChanged={passwordChanged}
              authError={authError}
              loginHintMessage={loginHintMessage}
              buyerCallbackUrl={buyerCallbackUrl}
              onSelectRole={setRole}
              onBack={() => setRole(null)}
            />
          </main>

          {/* Footer legal */}
          <footer className="py-2 text-center">
            <AuthLegal />
          </footer>
        </div>
      </AuroraBackground>
    </>
  );
}


