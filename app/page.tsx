import Link from "next/link";

import { AuroraBackground } from "@/components/aurora-background";
import { LandingWhatsappPhone } from "@/components/landing-whatsapp-phone";
import { MotionFadeIn } from "@/components/motion-fade-in";
import { getAuthenticatedAppHref } from "@/server/auth-guards";

const steps = [
  {
    title: "Ative sua conta",
    description:
      "Entre na RYANO, conclua sua ativação e prepare o canal que vai transformar atividade em leitura útil.",
  },
  {
    title: "Treine normalmente",
    description:
      "Seu treino continua sendo treino. O ganho está no retorno mais claro, mais agradável e mais fácil de revisar depois.",
  },
  {
    title: "Receba o resumo no WhatsApp",
    description:
      "Distância, duração, ritmo, frequência cardíaca e contexto aparecem em formato limpo, pronto para consumir em segundos.",
  },
];

const benefits = [
  {
    title: "Feedback que chega no tempo certo",
    description:
      "A sensação de entendimento vem logo após a sessão, quando o treino ainda está fresco e o hábito tem mais chance de se consolidar.",
  },
  {
    title: "Menos telas, mais clareza",
    description:
      "A RYANO reduz atrito entre treinar e interpretar seus números. Você abre o WhatsApp e já entende o essencial.",
  },
  {
    title: "Leitura premium, sem excesso",
    description:
      "A mensagem prioriza organização visual, hierarquia e objetividade para transformar dados esportivos em algo gostoso de acompanhar.",
  },
  {
    title: "Experiência pensada para repetição",
    description:
      "Quanto mais natural for abrir, ler e entender seu resumo, maior a chance de manter constância no acompanhamento.",
  },
];

const profiles = [
  "Quem corre cedo e quer revisar o treino sem abrir várias telas.",
  "Quem pedala, treina forte e gosta de ver o resumo logo depois da sessão.",
  "Quem quer acompanhar evolução sem transformar isso em tarefa cansativa.",
  "Quem valoriza clareza, velocidade e sensação de controle sobre a rotina esportiva.",
];

const trustBlocks = [
  "Dados reais e leitura objetiva, sem preencher a mensagem com informação irrelevante.",
  "Fluxo autenticado e protegido para que seu acompanhamento chegue no canal certo.",
  "Privacidade tratada com seriedade, sem promessas vagas nem linguagem enganosa.",
  "Experiência desenhada para parecer um app premium, não um relatório frio e difícil de consumir.",
];

const faqs = [
  {
    question: "O que chega no WhatsApp?",
    answer:
      "Uma leitura clara da atividade com os principais números disponíveis, como distância, duração, pace e frequência cardíaca.",
  },
  {
    question: "A ideia é substituir o app inteiro por uma mensagem?",
    answer:
      "Não. A proposta é tornar o primeiro contato com o treino mais rápido e prazeroso. O WhatsApp vira a porta de entrada para entender o que acabou de acontecer.",
  },
  {
    question: "Isso ajuda mesmo no hábito?",
    answer:
      "Ajuda porque reduz o esforço de revisão. Quando entender a sessão fica fácil, acompanhar evolução tende a acontecer com mais constância.",
  },
  {
    question: "A mensagem fica bonita só para marketing?",
    answer:
      "Não. O visual existe para facilitar leitura, dar contexto e melhorar a experiência de quem quer usar o relatório de verdade, não só receber notificação.",
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
                  <span className="text-shimmer">Seu pós-treino merece</span>
                  <br />
                  uma mensagem que dá vontade de abrir.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-foreground/76 sm:text-lg">
                  A RYANO transforma sua atividade em um resumo esportivo claro, elegante e rápido de consumir.
                  Você treina, abre o WhatsApp e entende o que aconteceu sem ruído, sem sobrecarga e sem perder tempo.
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
                <MetricTile label="Sensação" value="Clareza" />
                <MetricTile label="Formato" value="Leitura rápida" />
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
                  Um fluxo simples para transformar esforço em acompanhamento real.
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

          <section className="grid gap-4 lg:grid-cols-[1fr_1.02fr]">
            <MotionFadeIn>
              <article className="glass rounded-[30px] border-white/12 bg-[linear-gradient(180deg,oklch(0.39_0.05_220_/_0.74),oklch(0.33_0.045_190_/_0.6))] p-6 sm:p-8">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Por que isso converte em hábito</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                  Quanto mais fácil for entender seu treino, maior a chance de continuar acompanhando.
                </h2>
                <div className="mt-6 grid gap-3">
                  {benefits.map((benefit, index) => (
                    <MotionFadeIn key={benefit.title} delay={0.06 * index}>
                      <div className="rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,oklch(0.42_0.04_215_/_0.6),oklch(0.37_0.04_165_/_0.48))] px-4 py-4 text-sm leading-7 text-foreground/74">
                        <p className="font-semibold text-foreground">{benefit.title}</p>
                        <p className="mt-2">{benefit.description}</p>
                      </div>
                    </MotionFadeIn>
                  ))}
                </div>
              </article>
            </MotionFadeIn>

            <MotionFadeIn>
              <article className="glass rounded-[30px] border-white/12 bg-[linear-gradient(180deg,oklch(0.36_0.05_205_/_0.72),oklch(0.31_0.05_160_/_0.6))] p-6 sm:p-8">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Para quem isso faz sentido</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                  Uma experiência pensada para quem quer acompanhar melhor sem aumentar carga mental.
                </h2>
                <div className="mt-6 grid gap-3">
                  {profiles.map((profile, index) => (
                    <MotionFadeIn key={profile} delay={0.05 * index}>
                      <div className="rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,oklch(0.4_0.04_205_/_0.62),oklch(0.36_0.045_150_/_0.5))] px-4 py-4 text-sm font-medium text-foreground/76">
                        {profile}
                      </div>
                    </MotionFadeIn>
                  ))}
                </div>
              </article>
            </MotionFadeIn>
          </section>

          <section id="seguranca" className="scroll-mt-4 grid gap-4 lg:grid-cols-[0.94fr_1.06fr] sm:scroll-mt-6">
            <MotionFadeIn>
              <article className="glass rounded-[30px] border-white/12 bg-[linear-gradient(180deg,oklch(0.37_0.055_215_/_0.74),oklch(0.32_0.04_175_/_0.6))] p-6 sm:p-8">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Segurança e credibilidade</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                  O visual encanta, mas o valor vem da confiança no que chega até você.
                </h2>
                <div className="mt-6 grid gap-3">
                  {trustBlocks.map((block, index) => (
                    <MotionFadeIn key={block} delay={0.06 * index}>
                      <div className="rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,oklch(0.42_0.04_215_/_0.6),oklch(0.38_0.04_165_/_0.48))] px-4 py-4 text-sm leading-7 text-foreground/76">
                        {block}
                      </div>
                    </MotionFadeIn>
                  ))}
                </div>
              </article>
            </MotionFadeIn>

            <MotionFadeIn>
              <article className="glass rounded-[30px] border-white/12 bg-[linear-gradient(135deg,oklch(0.43_0.06_220_/_0.76),oklch(0.36_0.055_185_/_0.68),oklch(0.34_0.05_155_/_0.64))] p-6 sm:p-8">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-100">Prova de intenção de produto</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                  Cada detalhe da interface foi pensado para parecer mais app premium e menos relatório burocrático.
                </h2>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    "Hierarquia visual para bater o olho e entender rápido.",
                    "Cores azul e verde para transmitir leveza, energia e familiaridade com apps de mensagem.",
                    "Mensagem estruturada para parecer conversa útil, não dump técnico de dados.",
                    "Experiência mobile-first para manter a sensação de abrir um aplicativo real no dia a dia.",
                  ].map((item, index) => (
                    <MotionFadeIn key={item} delay={0.05 * index}>
                      <div className="rounded-[22px] border border-white/10 bg-white/8 px-4 py-4 text-sm font-medium text-foreground/82">
                        {item}
                      </div>
                    </MotionFadeIn>
                  ))}
                </div>
              </article>
            </MotionFadeIn>
          </section>

          <section id="faq" className="glass-strong scroll-mt-4 rounded-[34px] border-white/14 bg-[linear-gradient(180deg,oklch(0.39_0.05_215_/_0.74),oklch(0.31_0.045_168_/_0.64))] px-6 py-8 sm:scroll-mt-6 sm:px-8 sm:py-10">
            <MotionFadeIn>
              <div className="max-w-3xl space-y-3">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Perguntas frequentes</p>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Tudo para ajudar você a decidir rápido e começar com vontade.
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
                    Abra sua conta e faça seu treino chegar ao WhatsApp com mais clareza, velocidade e vontade de continuar.
                  </h2>
                  <p className="text-base leading-8 text-foreground/74">
                    A proposta da RYANO é simples: transformar acompanhamento esportivo em algo desejável de abrir, fácil de entender e natural de repetir.
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
          <div className={`grid gap-1 ${signedIn ? "grid-cols-3" : "grid-cols-3"}`}>
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
