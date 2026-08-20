import Link from "next/link";

import { AuroraBackground } from "@/components/aurora-background";
import { LandingAthleteCarousel } from "@/components/landing-athlete-carousel";
import { LandingWhatsappPhone } from "@/components/landing-whatsapp-phone";
import { MotionFadeIn } from "@/components/motion-fade-in";
import { getAuthenticatedAppHref } from "@/server/auth-guards";

const steps = [
  {
    title: "Ative sua conta",
    description: "Configure acesso e prepare canal de entrega.",
  },
  {
    title: "Treine normalmente",
    description: "Corra, pedale ou nade sem mudar sua rotina.",
  },
  {
    title: "Receba o resumo no WhatsApp",
    description: "Veja dados principais em segundos, sem ruído.",
  },
];

const conversionCards = [
  {
    eyebrow: "Hábito",
    title: "Por que isso converte em hábito",
    description: "Leitura curta, rápida e gostosa de abrir depois do treino.",
    points: ["menos telas", "entendimento imediato", "retorno no momento certo"],
  },
  {
    eyebrow: "Público",
    title: "Para quem isso faz sentido",
    description: "Feito para quem treina com constância e quer clareza sem esforço.",
    points: ["corrida", "bike", "natação"],
  },
  {
    eyebrow: "Confiança",
    title: "Segurança e credibilidade",
    description: "Dados objetivos, acesso autenticado e comunicação direta.",
    points: ["dados reais", "fluxo protegido", "privacidade séria"],
  },
  {
    eyebrow: "Produto",
    title: "Prova de intenção de produto",
    description: "Visual com cara de app premium, não de relatório frio.",
    points: ["hierarquia forte", "mobile first", "cara de conversa real"],
  },
] as const;

const faqs = [
  {
    question: "O que chega no WhatsApp?",
    answer: "Resumo limpo com os principais números da atividade e contexto rápido para leitura.",
  },
  {
    question: "Serve para triatleta?",
    answer: "Sim. A proposta favorece quem alterna corrida, bike e natação e quer leitura rápida do treino do dia.",
  },
  {
    question: "Substitui análise completa?",
    answer: "Não. É camada rápida de consumo. Primeiro entendimento vem no WhatsApp.",
  },
  {
    question: "Qual o ganho principal?",
    answer: "Menos fricção entre terminar treino e entender o que aconteceu.",
  },
];

export default async function Home() {
  const appHref = await getAuthenticatedAppHref();
  const signedIn = Boolean(appHref);

  return (
    <AuroraBackground className="min-h-screen bg-[linear-gradient(180deg,oklch(0.34_0.05_220),oklch(0.29_0.045_198),oklch(0.3_0.05_170))] px-4 py-4 sm:px-6 lg:px-8">
      <div id="top" className="mx-auto flex w-full max-w-7xl flex-col gap-12 sm:gap-16">
        <header className="glass rounded-[30px] border-white/14 bg-[linear-gradient(135deg,oklch(0.42_0.05_220_/_0.68),oklch(0.36_0.05_190_/_0.62),oklch(0.34_0.05_165_/_0.58))] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold tracking-[0.24em] text-foreground/88">RYANO</p>
              <p className="mt-1 text-sm text-foreground/66">Relatórios esportivos no WhatsApp com leitura rápida, estética premium e dados reais.</p>
            </div>
            <nav className="flex flex-wrap items-center gap-3 text-sm text-foreground/74">
              <a href="#como-funciona" className="hover:text-foreground">
                Como funciona
              </a>
              <a href="#seguranca" className="hover:text-foreground">
                Segurança
              </a>
              <a href="#faq" className="hover:text-foreground">
                FAQ
              </a>
              {signedIn ? (
                <>
                  <Link href={appHref!} className="glass-button rounded-full px-4 py-2 font-medium text-foreground">
                    Abrir app
                  </Link>
                  <Link href="/app/atividades" className="glass-button-primary rounded-full px-4 py-2 text-sm font-semibold">
                    Ver atividades
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/entrar" className="glass-button rounded-full px-4 py-2 font-medium text-foreground">
                    Entrar
                  </Link>
                  <Link href="/cadastro" className="glass-button-primary rounded-full px-4 py-2 text-sm font-semibold">
                    Começar agora
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>

        <main className="space-y-12 pb-28 sm:space-y-16 sm:pb-10">
          <section className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <MotionFadeIn className="space-y-8" delay={0.05}>
              <div className="space-y-5">
                <span className="inline-flex rounded-full border border-emerald-300/18 bg-[linear-gradient(135deg,oklch(0.84_0.1_210_/_0.22),oklch(0.82_0.14_165_/_0.2))] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-50">
                  O treino termina. A leitura começa no WhatsApp.
                </span>
                <h1 className="max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                  <span className="text-shimmer">Pós-treino com cara de app.</span>
                  <br />
                  Sem relatório cansativo.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-foreground/76 sm:text-lg">
                  Corrida, bike e natação viram uma mensagem limpa, bonita e rápida de entender.
                  Menos texto inútil. Mais vontade de acompanhar.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                {signedIn ? (
                  <>
                    <Link href={appHref!} className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold sm:w-auto">
                      Abrir minha área
                    </Link>
                    <Link href="/app/atividades" className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground sm:w-auto">
                      Ver atividades
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/cadastro" className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold sm:w-auto">
                      Quero começar agora
                    </Link>
                    <a href="#exemplo" className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground sm:w-auto">
                      Ver a mensagem exemplo
                    </a>
                  </>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricTile label="Canal" value="WhatsApp" />
                <MetricTile label="Visual" value="Premium" />
                <MetricTile label="Leitura" value="Rápida" />
              </div>
            </MotionFadeIn>

            <MotionFadeIn className="flex justify-center lg:justify-end" delay={0.12}>
              <div id="exemplo" className="scroll-mt-4 sm:scroll-mt-6">
                <LandingWhatsappPhone />
              </div>
            </MotionFadeIn>
          </section>

          <section id="como-funciona" className="scroll-mt-4 space-y-6 sm:scroll-mt-6">
            <MotionFadeIn>
              <div className="max-w-2xl space-y-3">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Como funciona</p>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Fluxo simples. Valor imediato.
                </h2>
              </div>
            </MotionFadeIn>
            <div className="grid gap-4 lg:grid-cols-3">
              {steps.map((card, index) => (
                <MotionFadeIn key={card.title} delay={0.08 * index}>
                  <article className="glass h-full rounded-[28px] border-white/12 bg-[linear-gradient(180deg,oklch(0.39_0.045_215_/_0.7),oklch(0.33_0.04_175_/_0.56))] p-6">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-sm font-semibold text-emerald-100">
                      0{index + 1}
                    </span>
                    <h3 className="mt-5 text-xl font-semibold tracking-tight">{card.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-foreground/72">{card.description}</p>
                  </article>
                </MotionFadeIn>
              ))}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.04fr_0.96fr] lg:items-stretch">
            <MotionFadeIn>
              <article className="glass h-full rounded-[32px] border-white/12 bg-[linear-gradient(180deg,oklch(0.4_0.05_215_/_0.72),oklch(0.34_0.05_175_/_0.58))] p-6 sm:p-8">
                <div className="max-w-2xl space-y-4">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Hero visual para triatleta</p>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Corrida, bike e natação com leitura visual de performance.
                  </h2>
                  <p className="max-w-xl text-base leading-8 text-foreground/74">
                    Em vez de mais texto, a página agora mostra volume, ritmo e evolução em linguagem visual de produto esportivo.
                  </p>
                </div>

                <LandingAthleteCarousel />
              </article>
            </MotionFadeIn>

            <div className="grid gap-5 sm:grid-cols-2">
              {conversionCards.map((card, index) => (
                <MotionFadeIn key={card.title} delay={0.04 * index}>
                  <article
                    id={card.title === "Segurança e credibilidade" ? "seguranca" : undefined}
                    className="glass h-full rounded-[32px] border-white/12 bg-[linear-gradient(180deg,oklch(0.41_0.05_215_/_0.7),oklch(0.35_0.045_165_/_0.56))] p-6 sm:p-7"
                  >
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">{card.eyebrow}</p>
                    <h3 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{card.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-foreground/72">{card.description}</p>
                    <div className="mt-6 flex flex-wrap gap-2.5">
                      {card.points.map((point) => (
                        <span
                          key={point}
                          className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-foreground/82"
                        >
                          {point}
                        </span>
                      ))}
                    </div>
                  </article>
                </MotionFadeIn>
              ))}
            </div>
          </section>

          <section id="faq" className="glass-strong scroll-mt-4 rounded-[34px] border-white/14 bg-[linear-gradient(180deg,oklch(0.39_0.05_215_/_0.74),oklch(0.31_0.045_168_/_0.64))] px-6 py-8 sm:scroll-mt-6 sm:px-8 sm:py-10">
            <MotionFadeIn>
              <div className="max-w-3xl space-y-3">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Perguntas frequentes</p>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Direto ao ponto.
                </h2>
              </div>
            </MotionFadeIn>
            <div className="mt-8 grid gap-3">
              {faqs.map((item, index) => (
                <MotionFadeIn key={item.question} delay={0.05 * index}>
                  <details className="rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,oklch(0.42_0.04_215_/_0.6),oklch(0.38_0.04_165_/_0.48))] px-5 py-4 text-sm text-foreground/76">
                    <summary className="cursor-pointer list-none font-semibold text-foreground">{item.question}</summary>
                    <p className="mt-3 leading-7">{item.answer}</p>
                  </details>
                </MotionFadeIn>
              ))}
            </div>
          </section>

          <MotionFadeIn>
            <section className="glass-strong rounded-[34px] border-white/14 bg-[linear-gradient(135deg,oklch(0.43_0.06_220_/_0.78),oklch(0.36_0.055_180_/_0.7),oklch(0.35_0.05_155_/_0.66))] px-6 py-8 sm:px-8 sm:py-10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl space-y-3">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-100">Comece agora</p>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Faça treino virar mensagem que dá vontade de abrir.
                  </h2>
                  <p className="text-base leading-8 text-foreground/74">
                    Clareza, ritmo visual e leitura rápida no canal que você já usa todo dia.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {signedIn ? (
                    <>
                      <Link href={appHref!} className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold">
                        Abrir minha área
                      </Link>
                      <Link href="/app/perfil" className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground">
                        Ver perfil
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link href="/cadastro" className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold">
                        Começar agora
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

        <footer className="border-t border-white/10 pb-6 pt-2">
          <div className="flex flex-col gap-4 text-sm text-foreground/62 sm:flex-row sm:items-center sm:justify-between">
            <p>RYANO · relatórios esportivos no WhatsApp com leitura rápida, clara e visual premium.</p>
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
                {signedIn ? "Abrir app" : "Login"}
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
                <MobileDockLink href="/app/atividades" label="Atividades" />
                <MobileDockLink href="/app/perfil" label="Perfil" />
              </>
            ) : (
              <>
                <MobileDockLink href="/" label="Home" active />
                <MobileDockLink href="/entrar" label="Entrar" />
                <MobileDockLink href="/cadastro" label="Cadastro" />
              </>
            )}
          </div>
        </div>
      </div>
    </AuroraBackground>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-[24px] border-white/12 bg-[linear-gradient(135deg,oklch(0.4_0.05_215_/_0.68),oklch(0.36_0.05_165_/_0.56))] p-5">
      <p className="text-sm text-foreground/62">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
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
