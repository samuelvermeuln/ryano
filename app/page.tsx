import Link from "next/link";

import { AuroraBackground } from "@/components/aurora-background";

const flowCards = [
  {
    title: "Conecte seu wearable",
    description:
      "Garmin disponível na V1. Arquitetura preparada para adicionar novos providers sem acoplar produto inteiro ao primeiro integrador.",
  },
  {
    title: "RYANO organiza seus dados",
    description:
      "Atividades, histórico, sincronização e visão consolidada em uma base pensada para evolução futura do produto.",
  },
  {
    title: "Receba relatórios no WhatsApp",
    description:
      "Insights úteis no canal mais prático do dia a dia, sempre respeitando dados realmente disponíveis e status real da sua conta.",
  },
];

const benefits = [
  "Acompanhamento de evolução com foco em uso simples.",
  "Histórico centralizado de atividades e integrações.",
  "Insights e relatórios sem depender de múltiplos apps abertos.",
  "Base pronta para treino, nutrição, performance e novas modalidades.",
];

const wearables = [
  { name: "Garmin", status: "Disponível na V1" },
  { name: "Apple Watch", status: "Em breve" },
  { name: "Polar", status: "Em breve" },
  { name: "Coros", status: "Em breve" },
  { name: "Suunto", status: "Em breve" },
  { name: "Fitbit", status: "Em breve" },
];

const evolutionBlocks = [
  "Treino e planejamento esportivo",
  "Alimentação e rotina",
  "Performance e comparação de períodos",
  "Múltiplas modalidades e novos acessórios",
];

export default function Home() {
  return (
    <AuroraBackground className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-16">
        <header className="glass rounded-[28px] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold tracking-[0.24em] text-foreground/80">
                RYANO
              </p>
              <p className="mt-1 text-sm text-foreground/60">
                Dados esportivos, evolução e relatórios no WhatsApp.
              </p>
            </div>
            <nav className="flex flex-wrap items-center gap-3 text-sm text-foreground/70">
              <a href="#como-funciona" className="hover:text-foreground">
                Como funciona
              </a>
              <a href="#wearables" className="hover:text-foreground">
                Wearables
              </a>
              <a href="#seguranca" className="hover:text-foreground">
                Segurança
              </a>
              <Link href="/entrar" className="glass-button rounded-full px-4 py-2 font-medium text-foreground">
                Entrar
              </Link>
              <Link
                href="/cadastro"
                className="glass-button-primary rounded-full px-4 py-2 text-sm font-semibold"
              >
                Começar
              </Link>
            </nav>
          </div>
        </header>

        <main className="space-y-16 pb-10">
          <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-8">
              <div className="space-y-5">
                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium tracking-[0.18em] text-accent uppercase">
                  Garmin primeiro. Produto maior desde o início.
                </span>
                <h1 className="max-w-4xl text-5xl font-semibold leading-tight sm:text-6xl">
                  <span className="text-shimmer">Conecte seus dados esportivos</span>
                  <br />
                  acompanhe evolução e receba insights no WhatsApp.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-foreground/72">
                  A RYANO nasce para ir além de um visualizador de dados. Na V1, conecta Garmin,
                  organiza atividades e prepara base para relatórios, rotina esportiva, treino,
                  nutrição e performance.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/cadastro"
                  className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold sm:w-auto"
                >
                  Começar cadastro
                </Link>
                <Link
                  href="/entrar"
                  className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground sm:w-auto"
                >
                  Entrar na plataforma
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="glass rounded-[24px] p-5">
                  <p className="text-sm text-foreground/60">Integração inicial</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">Garmin</p>
                </div>
                <div className="glass rounded-[24px] p-5">
                  <p className="text-sm text-foreground/60">Canal principal</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">WhatsApp</p>
                </div>
                <div className="glass rounded-[24px] p-5">
                  <p className="text-sm text-foreground/60">Arquitetura</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">Pronta para crescer</p>
                </div>
              </div>
            </div>

            <div className="glass-strong float rounded-[32px] p-5 sm:p-6">
              <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,oklch(0.18_0.03_250_/_0.92),oklch(0.12_0.02_250_/_0.92))] p-5 shadow-[0_24px_80px_rgba(4,10,26,0.35)]">
                <div className="flex items-center justify-between rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/70">
                  <span>Status da conta</span>
                  <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-200">
                    Garmin conectado
                  </span>
                </div>
                <div className="mt-5 space-y-4">
                  <div className="glass rounded-[24px] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-foreground/60">Última atividade</p>
                        <h2 className="mt-2 text-xl font-semibold tracking-tight">Corrida intervalada</h2>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-accent">
                        Garmin
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-foreground/55">Duração</p>
                        <p className="mt-1 font-semibold text-foreground">48 min</p>
                      </div>
                      <div>
                        <p className="text-foreground/55">Distância</p>
                        <p className="mt-1 font-semibold text-foreground">9,6 km</p>
                      </div>
                      <div>
                        <p className="text-foreground/55">Frequência</p>
                        <p className="mt-1 font-semibold text-foreground">4x semana</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="glass rounded-[24px] p-4">
                      <p className="text-sm text-foreground/60">Relatórios</p>
                      <p className="mt-2 text-lg font-semibold tracking-tight">WhatsApp verificado</p>
                      <p className="mt-2 text-sm leading-7 text-foreground/68">
                        Resumos enviados somente quando identidade estiver validada de forma confiável.
                      </p>
                    </div>
                    <div className="glass rounded-[24px] p-4">
                      <p className="text-sm text-foreground/60">Próximo passo</p>
                      <p className="mt-2 text-lg font-semibold tracking-tight">Dashboard completo</p>
                      <p className="mt-2 text-sm leading-7 text-foreground/68">
                        Métricas reais, histórico e status de integrações em um único fluxo.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="como-funciona" className="space-y-6">
            <div className="max-w-2xl space-y-3">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Como funciona</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Fluxo simples para dados esportivos virarem acompanhamento útil.
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {flowCards.map((card, index) => (
                <article key={card.title} className="glass rounded-[28px] p-6">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-accent">
                    0{index + 1}
                  </span>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">{card.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-foreground/68">{card.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
            <article className="glass rounded-[28px] p-6 sm:p-8">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Benefícios</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">Menos dispersão. Mais clareza no acompanhamento.</h2>
              <div className="mt-6 grid gap-3">
                {benefits.map((benefit) => (
                  <div
                    key={benefit}
                    className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-foreground/72"
                  >
                    {benefit}
                  </div>
                ))}
              </div>
            </article>

            <article id="wearables" className="glass rounded-[28px] p-6 sm:p-8">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Wearables</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                Garmin liberado agora. Novos providers só quando forem reais.
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {wearables.map((item) => (
                  <div key={item.name} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-foreground">{item.name}</span>
                      <span className="text-xs text-foreground/60">{item.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section id="seguranca" className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <article className="glass rounded-[28px] p-6 sm:p-8">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Segurança e privacidade</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">Comunicação fiel ao que produto realmente faz.</h2>
              <div className="mt-6 space-y-4 text-sm leading-7 text-foreground/72">
                <p>
                  Na conexão Garmin desta versão, credenciais são enviadas ao backend da RYANO para
                  comunicação com serviço Garmin já existente. Informações sensíveis não devem aparecer em
                  logs, respostas do navegador ou código versionado.
                </p>
                <p>
                  Relatórios no WhatsApp só devem acontecer com identidade validada. Segurança será
                  comunicada sempre com precisão técnica, sem promessas absolutas.
                </p>
              </div>
            </article>

            <article className="glass rounded-[28px] p-6 sm:p-8">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Evolução do produto</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">Base atual preparada para próximas fases.</h2>
              <div className="mt-6 grid gap-3">
                {evolutionBlocks.map((block) => (
                  <div
                    key={block}
                    className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm font-medium text-foreground/76"
                  >
                    {block}
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="glass-strong rounded-[32px] px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-3">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">Pronto para primeira versão</p>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Comece com Garmin, organize dados e prepare rotina de acompanhamento.
                </h2>
                <p className="text-base leading-8 text-foreground/70">
                  Interface pública entregue nesta etapa. Próximos blocos ligam banco, autenticação,
                  onboarding, integrações e dashboard real.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/cadastro"
                  className="glass-button-primary rounded-full px-6 py-3 text-center text-sm font-semibold"
                >
                  Criar conta
                </Link>
                <Link
                  href="/entrar"
                  className="glass-button rounded-full px-6 py-3 text-center text-sm font-semibold text-foreground"
                >
                  Ver entrada
                </Link>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10 pb-6 pt-2">
          <div className="flex flex-col gap-4 text-sm text-foreground/60 sm:flex-row sm:items-center sm:justify-between">
            <p>RYANO · dados esportivos, integrações e relatórios no WhatsApp.</p>
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
              <Link href="/entrar" className="hover:text-foreground">
                Login
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </AuroraBackground>
  );
}
