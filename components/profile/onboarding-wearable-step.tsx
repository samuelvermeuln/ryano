"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { IconArrowRight, IconClock, IconRefresh } from "@tabler/icons-react";

import { ScreenGarminConect } from "@/components/integrations/garmin/screenGarminConect";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { getProviderVisual } from "@/modules/shared/integrations/catalog/visual";
import type { IntegrationCardViewModel } from "@/modules/shared/integrations/presentation";

type GarminConnection = {
  status: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
} | null;

type OnboardingWearableStepProps = {
  /** Providers esportivos conectados (qualquer provider, exceto WhatsApp). */
  connected: readonly IntegrationCardViewModel[];
  /** Providers `AVAILABLE` e desconectados, prontos para conectar. */
  available: readonly IntegrationCardViewModel[];
  /** Conexão Garmin detalhada, para preservar a experiência rica de conexão. */
  garminConnection: GarminConnection;
  /** Avança para a próxima etapa do onboarding (pular / continuar). */
  onContinue: () => void;
};

/**
 * Passo de wearable do onboarding, agora multi-provider.
 *
 * Apresenta qualquer provider `AVAILABLE` do catálogo (Garmin com o fluxo rico
 * de credenciais; Strava como placeholder até a Fase 5) e permite pular a etapa
 * e conectar depois. A conclusão do onboarding não depende de nenhum provider
 * conectado (Req 14.1, 14.2, 14.3).
 */
export function OnboardingWearableStep({
  connected,
  available,
  garminConnection,
  onContinue,
}: OnboardingWearableStepProps) {
  // Garmin mantém seu card dedicado com a UX rica de conexão/erro; é exibido
  // sempre que estiver disponível ou já conectado.
  const showGarmin = [...connected, ...available].some((card) => card.provider === "GARMIN");

  // Demais providers esportivos (ex.: Strava) são apresentados de forma
  // genérica — a UI não conhece OAuth/credenciais de cada um.
  const otherProviders = [...connected, ...available].filter((card) => card.provider !== "GARMIN");

  const connectedCount = connected.length;
  const hasConnection = connectedCount > 0;

  return (
    <div className="space-y-4 lg:space-y-5">
      <SectionCard
        title="Conecte seus treinos"
        description="Etapa opcional: conecte um serviço agora para importar seus treinos automaticamente, ou pule e conecte quando quiser."
        action={
          <StatusBadge tone={hasConnection ? "success" : "neutral"}>
            {hasConnection ? `${connectedCount} conectado${connectedCount > 1 ? "s" : ""}` : "Opcional"}
          </StatusBadge>
        }
      >
        <div className="space-y-4">
          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-foreground/72">
            <p>
              Você pode conectar um dispositivo agora ou seguir sem conectar. Novas integrações podem ser
              adicionadas a qualquer momento na tela de Integrações.
            </p>
          </div>

          {otherProviders.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {otherProviders.map((card) => (
                <ProviderConnectCard key={card.provider} card={card} />
              ))}
            </div>
          ) : null}
        </div>
      </SectionCard>

      {showGarmin ? <ScreenGarminConect connection={garminConnection} /> : null}

      <div className="flex flex-col gap-3 rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-foreground/68">
          {hasConnection
            ? "Tudo pronto por aqui. Você pode conectar mais serviços depois em Integrações."
            : "Sem pressa: você pode conectar um dispositivo depois em Integrações."}
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="glass-button-primary inline-flex items-center justify-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold"
        >
          {hasConnection ? "Continuar" : "Pular por enquanto"}
          <IconArrowRight size={18} stroke={1.9} />
        </button>
      </div>
    </div>
  );
}

function ProviderConnectCard({ card }: { card: IntegrationCardViewModel }) {
  const [placeholderOpen, setPlaceholderOpen] = useState(false);
  const iconName = getProviderVisual(card.provider).icon;

  return (
    <div className="flex flex-col gap-4 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/14 bg-cyan-400/10 text-cyan-100">
            <Icon icon={iconName} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{card.name}</p>
            <p className="text-sm leading-6 text-foreground/60">{card.description}</p>
          </div>
        </div>
        <StatusBadge tone={card.connected ? "success" : "neutral"}>
          {card.connected ? "Conectado" : "Disponível"}
        </StatusBadge>
      </div>

      {card.connected ? (
        <p className="text-sm leading-6 text-foreground/68">
          {card.name} conectado. Suas atividades serão importadas automaticamente.
        </p>
      ) : (
        <div className="space-y-3">
          {placeholderOpen ? (
            <div className="theme-panel-neutral flex items-start gap-2 rounded-[16px] border px-4 py-3 text-sm leading-6">
              <IconClock size={16} stroke={1.9} className="mt-0.5 shrink-0" />
              <span>
                Estamos finalizando a integração com {card.name}. Em breve você poderá conectar sua conta por aqui.
              </span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setPlaceholderOpen(true)}
            className="glass-button inline-flex items-center gap-2 rounded-[16px] px-4 py-2.5 text-sm font-semibold text-foreground"
          >
            <IconRefresh size={16} stroke={1.8} />
            {`Conectar ${card.name}`}
          </button>
        </div>
      )}
    </div>
  );
}

export type { OnboardingWearableStepProps };
