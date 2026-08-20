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

import { AuroraBackground } from "@/components/aurora-background";
import { LandingAthleteCarousel } from "@/components/landing-athlete-carousel";
import { SportIcon } from "@/components/icons/SportIcon";
import { LandingExperienceProvider } from "@/components/landing-experience-context";
import { LandingWhatsappPhone } from "@/components/landing-whatsapp-phone";
import { MotionFadeIn } from "@/components/motion-fade-in";
import { getPublicAuthenticatedAppHref } from "@/server/auth-guards";
import { buildIndexableMetadata } from "@/server/seo";
import { getSportLabel } from "@/lib/sports";

const heroCards = [
  {
    title: "Automático",
    description: "O treino terminou, o relatório chega.",
    icon: IconBolt,
  },
  {
    title: "Fácil de entender",
    description: "As métricas importantes ficam em destaque.",
    icon: IconChartBar,
  },
  {
    title: "No WhatsApp",
    description: "Sem precisar abrir outro aplicativo.",
    icon: IconBrandWhatsapp,
  },
] as const;

const steps = [
  {
    title: "Conecte seus treinos",
    description: "Crie sua conta e conecte sua fonte de atividades.",
    icon: IconLink,
  },
  {
    title: "Treine normalmente",
    description: "Corra, pedale ou nade sem mudar sua rotina.",
    icon: IconUserCheck,
  },
  {
    title: "Receba sua análise",
    description: "Assim que a atividade sincronizar, seu resumo chega no WhatsApp.",
    icon: IconMessageCircle,
  },
] as const;

const modalityCards = [
  {
    sport: "swim",
    description: "Ritmo, distância, SWOLF e evolução.",
  },
  {
    sport: "bike",
    description: "Velocidade, potência, elevação e carga.",
  },
  {
    sport: "run",
    description: "Ritmo, frequência cardíaca, cadência e distância.",
  },
  {
    sport: "triathlon",
    description: "Suas três modalidades em uma visão única.",
  },
] as const;

const securityItems = [
  {
    title: "Credenciais armazenadas com segurança",
    description: "Credenciais sensíveis ficam protegidas no servidor.",
    icon: IconLock,
  },
  {
    title: "Dados não públicos",
    description: "Seus dados esportivos aparecem apenas na sua área autenticada.",
    icon: IconShieldCheck,
  },
  {
    title: "Integrações podem ser desconectadas",
    description: "Você controla quando conectar, sincronizar ou remover acessos.",
    icon: IconRefresh,
  },
  {
    title: "Acesso com recuperação de senha",
    description: "Fluxos de autenticação e redefinição de senha já fazem parte da aplicação.",
    icon: IconUserCheck,
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
  const signedInSecondaryHref = appArea ? "/app/atividades" : appHref ?? "/";
  const signedInSecondaryLabel = appArea ? "Ver atividades" : appHref === "/admin" ? "Abrir painel" : "Continuar ativação";
  const signedInTertiaryHref = appArea ? "/app/perfil" : appHref ?? "/";
  const signedInTertiaryLabel = appArea ? "Perfil" : appHref === "/admin" ? "Painel admin" : "Continuar";

  return (
    <AuroraBackground className="min-h-screen bg-[linear-gradient(180deg,oklch(0.34_0.05_220),oklch(0.29_0.045_198),oklch(0.3_0.05_170))] px-4 py-4 sm:px-6 lg:px-8">
      <div id="top" className="mx-auto flex w-full max-w-7xl flex-col gap-12 sm:gap-16">
        <header className="glass rounded-[30px] border-white/14 bg-[linear-gradient(135deg,oklch(0.42_0.05_220_/_0.68),oklch(0.36_0.05_190_/_0.62),oklch(0.34_0.05_165_/_0.58))] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold tracking-[0.24em] text-foreground/88">RYANO</p>
              <p className="mt-1 text-sm text-foreground/66">Seus dados esportivos, direto no WhatsApp.</p>
            </div>
            <nav className="flex flex-wrap items-center gap-3 text-sm text-foreground/74">
              <a href="#como-funciona" className="hover:text-foreground">
                Como funciona
              </a>
              <a href="#veja-na-pratica" className="hover:text-foreground">
                Veja na prática
              </a>
              <a href="#modalidades" className="hover:text-foreground">
                Modalidades
              </a>
              <a href="#seguranca" className="hover:text-foreground">
                Segurança
              </a>
              {signedIn ? (
                <Link href={appHref!} className="glass-button rounded-full px-4 py-2 font-medium text-foreground">
                  Abrir app
                </Link>
              ) : (
                <Link href="/cadastro" className="glass-button-primary rounded-full px-4 py-2 text-sm font-semibold">
                  Criar minha conta
                </Link>
              )}
            </nav>
          </div>
        </header>

        <LandingExperienceProvider>
          <main className="space-y-12 pb-28 sm:space-y-16 sm:pb-10">
            <section className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
              <MotionFadeIn className="space-y-8" delay={0.05}>
                <div className="space-y-5">
                  <span className="inline-flex rounded-full border border-emerald-300/18 bg-[linear-gradient(135deg,oklch(0.84_0.1_210_/_0.22),oklch(0.82_0.14_165_/_0.2))] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-50">
                    Terminou o treino? Seu resumo já está no WhatsApp.
                  </span>
                  <h1 className="max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                    <span className="text-shimmer">Entenda seu treino em segundos.</span>
                    <br />
                    Seus dados esportivos, direto no WhatsApp.
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
                        Abrir minha área
                      </Link>
                      <Link href={signedInSecondaryHref} className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground sm:w-auto">
                        {signedInSecondaryLabel}
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link href="/cadastro" className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold sm:w-auto">
                        Criar minha conta
                      </Link>
                      <a href="#veja-na-pratica" className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground sm:w-auto">
                        Ver exemplo de relatório
                      </a>
                    </>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {heroCards.map((card) => {
                    const Icon = card.icon;

                    return (
                      <div key={card.title} className="rounded-[24px] border border-white/10 bg-white/6 p-5">
                        <div className="grid h-11 w-11 place-items-center rounded-[16px] border border-white/10 bg-white/8 text-accent">
                          <Icon size={20} stroke={1.9} aria-hidden="true" />
                        </div>
                        <p className="mt-4 text-base font-semibold text-foreground">{card.title}</p>
                        <p className="mt-2 text-sm leading-7 text-foreground/70">{card.description}</p>
                      </div>
                    );
                  })}
                </div>
              </MotionFadeIn>

              <MotionFadeIn className="flex justify-center lg:justify-end" delay={0.12}>
                <div id="veja-na-pratica" className="scroll-mt-4 sm:scroll-mt-6">
                  <LandingWhatsappPhone />
                </div>
              </MotionFadeIn>
            </section>

            <section id="como-funciona" className="scroll-mt-4 space-y-6 sm:scroll-mt-6">
              <MotionFadeIn>
                <div className="max-w-2xl space-y-3">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Como funciona</p>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Do treino ao resumo em poucos segundos.
                  </h2>
                  <p className="text-base leading-8 text-foreground/72">
                    Treine normalmente. O RYANO cuida do resto.
                  </p>
                </div>
              </MotionFadeIn>
              <div className="grid gap-4 lg:grid-cols-3">
                {steps.map((card, index) => {
                  const Icon = card.icon;

                  return (
                    <MotionFadeIn key={card.title} delay={0.08 * index}>
                      <article className="h-full rounded-[28px] border border-white/10 bg-white/6 p-6">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-sm font-semibold text-emerald-100">
                            0{index + 1}
                          </span>
                          <div className="grid h-10 w-10 place-items-center rounded-[16px] border border-white/10 bg-white/8 text-accent">
                            <Icon size={18} stroke={1.9} aria-hidden="true" />
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

            <section className="scroll-mt-4 sm:scroll-mt-6">
              <MotionFadeIn>
                <article className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,28,46,0.78),rgba(11,26,42,0.92))] p-6 sm:p-8">
                  <LandingAthleteCarousel />
                </article>
              </MotionFadeIn>
            </section>

            <section id="modalidades" className="scroll-mt-4 space-y-6 sm:scroll-mt-6">
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
                    <article className="h-full rounded-[28px] border border-white/10 bg-white/6 p-6">
                      <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-[18px] bg-white/8 text-foreground">
                          <SportIcon sport={card.sport} size={26} className="text-current" />
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
                <article className="rounded-[28px] border border-white/10 bg-white/6 p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-foreground/78">
                        <SportIcon sport="default" size={16} className="text-current" />
                        Garmin
                      </div>
                      <h3 className="text-xl font-semibold text-foreground">Sincronize suas atividades automaticamente</h3>
                      <p className="max-w-2xl text-sm leading-7 text-foreground/70">
                        Depois da conexão, as atividades entram no fluxo de sincronização e podem gerar relatórios direto no WhatsApp.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-medium text-foreground/80">
                      <IconChevronRight size={16} stroke={1.8} aria-hidden="true" />
                      Pronto para conectar
                    </div>
                  </div>
                </article>
              </MotionFadeIn>
            </section>

            <section id="seguranca" className="scroll-mt-4 space-y-6 sm:scroll-mt-6">
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
                      <article className="h-full rounded-[28px] border border-white/10 bg-white/6 p-6">
                        <div className="grid h-11 w-11 place-items-center rounded-[16px] border border-white/10 bg-white/8 text-accent">
                          <Icon size={20} stroke={1.9} aria-hidden="true" />
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
                      Termine o treino. O RYANO mostra o que importa.
                    </h2>
                    <p className="text-base leading-8 text-foreground/74">
                      Conecte suas atividades e receba um resumo claro do seu desempenho direto no WhatsApp.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {signedIn ? (
                      <>
                        <Link href={appHref!} className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold">
                          Abrir minha área
                        </Link>
                        <Link href={signedInSecondaryHref} className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground">
                          {signedInSecondaryLabel}
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link href="/cadastro" className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold">
                          Criar minha conta
                        </Link>
                        <Link href="/entrar" className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground">
                          Já tenho conta
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </section>
            </MotionFadeIn>
          </main>
        </LandingExperienceProvider>

        <footer className="border-t border-white/10 pb-6 pt-2">
          <div className="flex flex-col gap-4 text-sm text-foreground/62 sm:flex-row sm:items-center sm:justify-between">
            <p>RYANO · seus treinos, mais fáceis de entender.</p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/termos" className="hover:text-foreground">
                Termos
              </Link>
              <Link href="/privacidade" className="hover:text-foreground">
                Privacidade
              </Link>
              <a href="mailto:contato@ryano.app" className="hover:text-foreground">
                Contato
              </a>
              <Link href={signedIn ? appHref! : "/entrar"} className="hover:text-foreground">
                {signedIn ? "Abrir app" : "Entrar"}
              </Link>
            </div>
          </div>
        </footer>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.8rem)] sm:hidden">
        <div className="pointer-events-auto w-full max-w-md rounded-[32px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.08))] p-2 shadow-[0_18px_60px_rgba(4,78,95,0.24)] backdrop-blur-[28px] saturate-200">
          <div className="mb-2 flex justify-center">
            <div className="h-1 w-12 rounded-full bg-white/28" />
          </div>
          <div className="grid grid-cols-3 gap-1">
            {signedIn ? (
              <>
                <MobileDockLink href={appHref!} label="App" active />
                <MobileDockLink href={signedInSecondaryHref} label={signedInSecondaryLabel} />
                <MobileDockLink href={signedInTertiaryHref} label={signedInTertiaryLabel} />
              </>
            ) : (
              <>
                <MobileDockAnchor href="#top" label="Início" active />
                <MobileDockAnchor href="#veja-na-pratica" label="Exemplo" />
                <MobileDockLink href="/cadastro" label="Criar conta" />
              </>
            )}
          </div>
        </div>
      </div>
    </AuroraBackground>
  );
}

function MobileDockLink({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className="relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-[22px] px-3 py-2 text-center"
    >
      <span className={`text-xs font-medium ${active ? "text-foreground" : "text-foreground/66"}`}>{label}</span>
      <span className={`mt-1 h-1 rounded-full ${active ? "w-5 bg-foreground/90" : "w-1 bg-foreground/28"}`} />
    </Link>
  );
}

function MobileDockAnchor({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return (
    <a href={href} className="relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-[22px] px-3 py-2 text-center">
      <span className={`text-xs font-medium ${active ? "text-foreground" : "text-foreground/66"}`}>{label}</span>
      <span className={`mt-1 h-1 rounded-full ${active ? "w-5 bg-foreground/90" : "w-1 bg-foreground/28"}`} />
    </a>
  );
}
