import Link from "next/link";
import {
  IconBolt,
  IconBrandWhatsapp,
  IconChartBar,
  IconChevronRight,
  IconLink,
  IconLock,
  IconMessageCircle,
  IconRefresh,
  IconShieldCheck,
  IconUserCheck,
} from "@tabler/icons-react";

import { AppHeader } from "@/components/app-header";
import { AuroraBackground } from "@/components/aurora-background";
import { LandingAthleteCarousel } from "@/components/landing-athlete-carousel";
import { SportIcon } from "@/components/icons/SportIcon";
import { LandingExperienceProvider } from "@/components/landing-experience-context";
import { LandingWhatsappPhone } from "@/components/landing-whatsapp-phone";
import { MobileDock } from "@/components/mobile-dock";
import { MotionFadeIn } from "@/components/motion-fade-in";
import { getPublicAuthenticatedAppHref } from "@/server/auth-guards";
import { buildIndexableMetadata } from "@/server/seo";
import { getSportLabel } from "@/lib/sports";

const heroCards = [
  {
    title: "Automático",
    description: "O treino terminou, o relatório chega.",
    icon: IconBolt,
    iconClassName: "text-amber-300",
    shellClassName: "bg-amber-300/10",
    delay: "0s",
  },
  {
    title: "Fácil de entender",
    description: "As métricas importantes ficam em destaque.",
    icon: IconChartBar,
    iconClassName: "text-sky-300",
    shellClassName: "bg-sky-300/10",
    delay: "0.22s",
  },
  {
    title: "No WhatsApp",
    description: "Sem precisar abrir outro aplicativo.",
    icon: IconBrandWhatsapp,
    iconClassName: "feature-icon-whatsapp",
    shellClassName: "bg-emerald-300/10",
    delay: "0.44s",
  },
] as const;

const steps = [
  {
    title: "Conecte seus treinos",
    description: "Crie sua conta e conecte sua fonte de atividades.",
    icon: IconLink,
    iconClassName: "text-sky-300",
    shellClassName: "bg-sky-300/10",
    delay: "0s",
  },
  {
    title: "Treine normalmente",
    description: "Corra, pedale ou nade sem mudar sua rotina.",
    icon: IconUserCheck,
    iconClassName: "text-violet-300",
    shellClassName: "bg-violet-300/10",
    delay: "0.2s",
  },
  {
    title: "Receba sua análise",
    description: "Assim que a atividade sincronizar, seu resumo chega no WhatsApp.",
    icon: IconMessageCircle,
    iconClassName: "feature-icon-whatsapp",
    shellClassName: "bg-emerald-300/10",
    delay: "0.4s",
  },
] as const;

const modalityCards = [
  {
    sport: "swim",
    description: "Ritmo, distância, SWOLF e evolução.",
    shellClassName: "bg-sky-300/10",
    delay: "0s",
  },
  {
    sport: "bike",
    description: "Velocidade, potência, elevação e carga.",
    shellClassName: "bg-emerald-300/10",
    delay: "0.18s",
  },
  {
    sport: "run",
    description: "Ritmo, frequência cardíaca, cadência e distância.",
    shellClassName: "bg-amber-300/10",
    delay: "0.36s",
  },
  {
    sport: "triathlon",
    description: "Suas três modalidades em uma visão única.",
    shellClassName: "bg-violet-300/10",
    delay: "0.54s",
  },
] as const;

const securityItems = [
  {
    title: "Credenciais armazenadas com segurança",
    description: "Credenciais sensíveis ficam protegidas no servidor.",
    icon: IconLock,
    iconClassName: "text-amber-300",
    shellClassName: "bg-amber-300/10",
    delay: "0s",
  },
  {
    title: "Dados não públicos",
    description: "Seus dados esportivos aparecem apenas na sua área autenticada.",
    icon: IconShieldCheck,
    iconClassName: "text-sky-300",
    shellClassName: "bg-sky-300/10",
    delay: "0.18s",
  },
  {
    title: "Integrações podem ser desconectadas",
    description: "Você controla quando conectar, sincronizar ou remover acessos.",
    icon: IconRefresh,
    iconClassName: "text-violet-300",
    shellClassName: "bg-violet-300/10",
    delay: "0.36s",
  },
  {
    title: "Acesso com recuperação de senha",
    description: "Fluxos de autenticação e redefinição de senha já fazem parte da aplicação.",
    icon: IconUserCheck,
    iconClassName: "text-emerald-300",
    shellClassName: "bg-emerald-300/10",
    delay: "0.54s",
  },
] as const;

export const metadata = buildIndexableMetadata({
  title: "Seus treinos analisados no WhatsApp",
  description:
    "Acompanhe corrida, ciclismo, natação e triathlon com relatórios claros de desempenho entregues direto no WhatsApp.",
  path: "/",
});

export default async function Home() {
  const appHref = await getPublicAuthenticatedAppHref();
  const signedIn = Boolean(appHref);
  const appArea = appHref?.startsWith("/app/") ?? false;
  const signedInPrimaryLabel = appArea ? "Abrir app" : appHref === "/admin" ? "Abrir painel" : "Continuar configuração";
  const signedInSecondaryHref = appArea ? "/app/atividades" : appHref === "/admin" ? "/admin/usuarios" : appHref ?? "/";
  const signedInSecondaryLabel = appArea ? "Ver atividades" : appHref === "/admin" ? "Ver usuários" : "Continuar configuração";

  return (
    <>
      <AuroraBackground className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 sm:gap-16">
          <div id="top" className="scroll-mt-24 sm:scroll-mt-28" />
          <AppHeader
            tagline="Treinos, saúde e alertas do seu relógio, direto no seu WhatsApp."
            navLinks={[
              { href: "#como-funciona", label: "Como funciona" },
              { href: "#veja-na-pratica", label: "Veja na prática" },
              { href: "#modalidades", label: "Modalidades" },
              { href: "#seguranca", label: "Segurança" },
              { href: "/marketplace", label: "Marketplace" },
            ]}
            action={
              signedIn ? (
                <Link href={appHref!} className="glass-button rounded-full px-4 py-2 text-sm font-medium text-foreground">
                  {signedInPrimaryLabel}
                </Link>
              ) : (
                <Link href="/entrar" className="glass-button-primary rounded-full px-4 py-2 text-sm font-semibold">
                  Acessar
                </Link>
              )
            }
            className="hidden sm:block"
            animate={false}
          />

        <LandingExperienceProvider>
          <main className="space-y-12 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:space-y-16 sm:pb-10">
            <section className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
              <MotionFadeIn className="space-y-8" delay={0.05}>
                <div className="space-y-5">
                  <span className="landing-hero-pill inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]">
                    Terminou o treino? Seu resumo já está no WhatsApp.
                  </span>
                  <h1 className="landing-hero-title max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                    <span className="landing-hero-highlight">Entenda seu treino em segundos.</span>
                    <br />
                    Seus dados esportivos, direto no <span className="landing-hero-whatsapp">WhatsApp</span>.
                  </h1>
                  <p className="max-w-2xl text-base leading-8 text-foreground/76 sm:text-lg">
                    Conecte seus treinos e receba distância, ritmo, frequência cardíaca, evolução e os principais destaques logo após cada atividade.
                    Para corrida, ciclismo, natação e triathlon.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  {signedIn ? (
                    <>
                      <Link href={appHref!} className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold sm:w-auto">
                        {signedInPrimaryLabel}
                      </Link>
                      <Link href={signedInSecondaryHref} className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground sm:w-auto">
                        {signedInSecondaryLabel}
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link href="/entrar?modo=cadastro" className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold sm:w-auto">
                        Criar conta
                      </Link>
                      <a href="#veja-na-pratica" className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground sm:w-auto">
                        Ver exemplo
                      </a>
                    </>
                  )}
                </div>

                {/* Marketplace catalog — public (works anonymous or signed in;
                    `/marketplace` itself shows "Entrar" vs "Minha conta" in
                    its own header). Visible on every breakpoint, unlike the
                    desktop-only AppHeader navLinks entry above. */}
                <Link
                  href="/marketplace"
                  className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-foreground/72 hover:text-foreground"
                >
                  Ver marketplace de planos de treino
                  <IconChevronRight size={16} stroke={1.9} aria-hidden="true" />
                </Link>

                <div className="grid gap-3 sm:grid-cols-3">
                  {heroCards.map((card) => {
                    const Icon = card.icon;

                    return (
                      <div key={card.title} className="rounded-[24px] border border-white/10 bg-white/6 p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(4,78,95,0.14)]">
                        <div
                          className={`landing-card-icon-shell feature-icon-loop relative grid h-14 w-14 place-items-center rounded-[20px] border border-white/10 ${card.shellClassName}`}
                          style={{ animationDelay: card.delay }}
                        >
                          <span className="landing-card-icon-glow feature-icon-pulse absolute inset-1 rounded-[16px] bg-white/8" style={{ animationDelay: card.delay }} aria-hidden="true" />
                          <Icon size={28} stroke={1.95} aria-hidden="true" className={`relative z-10 ${card.iconClassName}`} />
                        </div>
                        <p className="mt-4 text-base font-semibold text-foreground">{card.title}</p>
                        <p className="mt-2 text-sm leading-7 text-foreground/70">{card.description}</p>
                      </div>
                    );
                  })}
                </div>
              </MotionFadeIn>

              <MotionFadeIn className="flex w-full justify-center lg:justify-end" delay={0.12}>
                <div className="w-full max-w-[378px] shrink-0">
                  <LandingWhatsappPhone />
                </div>
              </MotionFadeIn>
            </section>

            <section id="como-funciona" className="hidden scroll-mt-24 space-y-6 sm:block sm:scroll-mt-28">
              <MotionFadeIn>
                <div className="max-w-2xl space-y-3">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Como funciona</p>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Do treino ao resumo em poucos segundos.
                  </h2>
                  <p className="text-base leading-8 text-foreground/72">
                    Treine normalmente. O ryvano cuida do resto.
                  </p>
                </div>
              </MotionFadeIn>
              <div className="grid gap-4 lg:grid-cols-3">
                {steps.map((card, index) => {
                  const Icon = card.icon;

                  return (
                    <MotionFadeIn key={card.title} delay={0.08 * index}>
                      <article className="h-full rounded-[28px] border border-white/10 bg-white/6 p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(4,78,95,0.14)]">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/8 text-sm font-semibold text-emerald-100 shadow-[0_10px_24px_rgba(16,185,129,0.14)]">
                            0{index + 1}
                          </span>
                          <div
                            className={`landing-card-icon-shell feature-icon-loop relative grid h-[52px] w-[52px] place-items-center rounded-[18px] border border-white/10 ${card.shellClassName}`}
                            style={{ animationDelay: card.delay }}
                          >
                            <span className="landing-card-icon-glow feature-icon-pulse absolute inset-1 rounded-[14px] bg-white/8" style={{ animationDelay: card.delay }} aria-hidden="true" />
                            <Icon size={24} stroke={1.95} aria-hidden="true" className={`relative z-10 ${card.iconClassName}`} />
                          </div>
                        </div>
                        <h3 className="mt-5 text-xl font-semibold tracking-tight">{card.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-foreground/72">{card.description}</p>
                      </article>
                    </MotionFadeIn>
                  );
                })}
              </div>
            </section>

            <section id="veja-na-pratica" className="scroll-mt-24 sm:scroll-mt-28">
              <MotionFadeIn>
                <article className="landing-demo-shell rounded-[32px] border p-6 sm:p-8">
                  <LandingAthleteCarousel />
                </article>
              </MotionFadeIn>
            </section>

            <section id="modalidades" className="scroll-mt-24 space-y-6 sm:scroll-mt-28">
              <MotionFadeIn>
                <div className="max-w-2xl space-y-3">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Modalidades</p>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Feito para quem leva o treino a sério
                  </h2>
                  <p className="text-base leading-8 text-foreground/72">
                    Cada modalidade destaca as métricas mais úteis para acompanhar o seu desempenho.
                  </p>
                </div>
              </MotionFadeIn>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {modalityCards.map((card, index) => (
                  <MotionFadeIn key={card.sport} delay={0.04 * index}>
                    <article className="h-full rounded-[28px] border border-white/10 bg-white/6 p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(4,78,95,0.14)]">
                      <div className="flex items-center gap-3">
                        <div
                          className={`landing-card-icon-shell feature-icon-loop relative grid h-14 w-14 place-items-center rounded-[20px] border border-white/10 ${card.shellClassName}`}
                          style={{ animationDelay: card.delay }}
                        >
                          <span className="landing-card-icon-glow feature-icon-pulse absolute inset-1 rounded-[16px] bg-white/8" style={{ animationDelay: card.delay }} aria-hidden="true" />
                          <SportIcon sport={card.sport} size={30} className="relative z-10 text-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">{getSportLabel(card.sport)}</h3>
                      </div>
                      <p className="mt-4 text-sm leading-7 text-foreground/70">{card.description}</p>
                    </article>
                  </MotionFadeIn>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <MotionFadeIn>
                <div className="max-w-2xl space-y-3">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Integrações</p>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Conecte seus treinos
                  </h2>
                  <p className="text-base leading-8 text-foreground/72">
                    Garmin é a integração inicial para sincronizar atividades automaticamente e disparar o resumo pós-treino.
                  </p>
                </div>
              </MotionFadeIn>
              <MotionFadeIn>
                <article className="rounded-[28px] border border-white/10 bg-white/6 p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(4,78,95,0.14)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-foreground/78">
                        <SportIcon sport="default" size={18} className="text-current" />
                        Garmin
                      </div>
                      <h3 className="text-xl font-semibold text-foreground">Sincronize suas atividades automaticamente</h3>
                      <p className="max-w-2xl text-sm leading-7 text-foreground/70">
                        Depois da conexão, as atividades entram no fluxo de sincronização e podem gerar relatórios direto no WhatsApp.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-medium text-foreground/80 shadow-[0_12px_28px_rgba(4,78,95,0.1)]">
                      <IconChevronRight size={18} stroke={1.85} aria-hidden="true" />
                      Pronto para conectar
                    </div>
                  </div>
                </article>
              </MotionFadeIn>
            </section>

            <section id="seguranca" className="hidden scroll-mt-24 space-y-6 sm:block sm:scroll-mt-28">
              <MotionFadeIn>
                <div className="max-w-2xl space-y-3">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Segurança</p>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Seus dados esportivos continuam seus
                  </h2>
                  <p className="text-base leading-8 text-foreground/72">
                    Segurança e privacidade desde a conexão até o relatório.
                  </p>
                </div>
              </MotionFadeIn>

              <div className="grid gap-4 lg:grid-cols-2">
                {securityItems.map((item, index) => {
                  const Icon = item.icon;

                  return (
                    <MotionFadeIn key={item.title} delay={0.04 * index}>
                      <article className="h-full rounded-[28px] border border-white/10 bg-white/6 p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(4,78,95,0.14)]">
                        <div
                          className={`landing-card-icon-shell feature-icon-loop relative grid h-14 w-14 place-items-center rounded-[20px] border border-white/10 ${item.shellClassName}`}
                          style={{ animationDelay: item.delay }}
                        >
                          <span className="landing-card-icon-glow feature-icon-pulse absolute inset-1 rounded-[16px] bg-white/8" style={{ animationDelay: item.delay }} aria-hidden="true" />
                          <Icon size={28} stroke={1.95} aria-hidden="true" className={`relative z-10 ${item.iconClassName}`} />
                        </div>
                        <h3 className="mt-4 text-lg font-semibold text-foreground">{item.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-foreground/70">{item.description}</p>
                      </article>
                    </MotionFadeIn>
                  );
                })}
              </div>
            </section>

            <MotionFadeIn>
              <section className="glass-strong rounded-[34px] border-white/14 bg-[linear-gradient(135deg,oklch(0.43_0.06_220_/_0.78),oklch(0.36_0.055_180_/_0.7),oklch(0.35_0.05_155_/_0.66))] px-6 py-8 sm:px-8 sm:py-10">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl space-y-3">
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-100">Comece agora</p>
                    <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                      Termine o treino. O ryvano mostra o que importa.
                    </h2>
                    <p className="text-base leading-8 text-foreground/74">
                      Conecte suas atividades e receba um resumo claro do seu desempenho direto no WhatsApp.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {signedIn ? (
                      <>
                        <Link href={appHref!} className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold">
                          {signedInPrimaryLabel}
                        </Link>
                        <Link href={signedInSecondaryHref} className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground">
                          {signedInSecondaryLabel}
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link href="/entrar?modo=cadastro" className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold">
                          Criar conta
                        </Link>
                        <Link href="/entrar" className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground">
                          Entrar
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </section>
            </MotionFadeIn>
          </main>
        </LandingExperienceProvider>

        <footer className="hidden border-t border-white/10 pb-6 pt-2 sm:block">
          <div className="flex flex-col gap-4 text-sm text-foreground/62 sm:flex-row sm:items-center sm:justify-between">
            <p>ryvano · seus treinos, mais fáceis de entender.</p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/termos" className="hover:text-foreground">
                Termos
              </Link>
              <Link href="/privacidade" className="hover:text-foreground">
                Privacidade
              </Link>
              <a href="mailto:contato@ryvano.app" className="hover:text-foreground">
                Contato
              </a>
              <Link href={signedIn ? appHref! : "/entrar"} className="hover:text-foreground">
                {signedIn ? signedInPrimaryLabel : "Entrar"}
              </Link>
            </div>
          </div>
        </footer>
        </div>
      </AuroraBackground>

      <MobileDock variant="public" />
    </>
  );
}

