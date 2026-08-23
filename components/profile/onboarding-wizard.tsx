"use client";

import { useEffect, useMemo, useState } from "react";

import { ScreenGarminConect } from "@/components/integrations/garmin/screenGarminConect";
import { WhatsAppActivationCard } from "@/components/integrations/whatsapp-activation-card";
import { OnboardingForm } from "@/components/profile/onboarding-form";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";

type OnboardingStep = {
  id: string;
  number: string;
  title: string;
  description: string;
  complete: boolean;
};

type OnboardingWizardProps = {
  steps: readonly OnboardingStep[];
  initialStepId: string;
  user: {
    name: string | null;
    email: string;
    cpf: string | null;
    profile: {
      phoneE164: string | null;
      heightCm: number | null;
      weightKg: string | null;
    } | null;
    address: {
      postalCode: string | null;
      street: string | null;
      number: string | null;
      complement: string | null;
      district: string | null;
      city: string | null;
      state: string | null;
      country: string | null;
    } | null;
  };
  garminConnection: {
    status: string;
    lastSyncAt: Date | null;
    lastSyncStatus: string | null;
  } | null;
  whatsapp: {
    phone: string | null;
    verified: boolean;
  };
};

export function OnboardingWizard({
  steps,
  initialStepId,
  user,
  garminConnection,
  whatsapp,
}: OnboardingWizardProps) {
  const [activeStepId, setActiveStepId] = useState(initialStepId);
  const completedSteps = useMemo(() => steps.filter((step) => step.complete).length, [steps]);
  const progress = steps.length ? Math.round((completedSteps / steps.length) * 100) : 0;
  const activeStep = steps.find((step) => step.id === activeStepId) ?? steps[0];

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const applyHash = () => {
      const nextHash = window.location.hash.replace("#", "");
      if (steps.some((step) => step.id === nextHash)) {
        setActiveStepId(nextHash);
        return;
      }

      setActiveStepId(initialStepId);
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);

    return () => {
      window.removeEventListener("hashchange", applyHash);
    };
  }, [initialStepId, steps]);

  const goToStep = (stepId: string) => {
    setActiveStepId(stepId);

    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = `${window.location.pathname}${window.location.search}#${stepId}`;
    window.history.replaceState(null, "", nextUrl);
    window.dispatchEvent(new Event("hashchange"));
  };

  return (
    <div className="space-y-4 lg:space-y-5">
      <section className="px-1 pt-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.15rem]">
          Configure sua conta
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/68 sm:text-base">
          Complete as informações abaixo para personalizar sua experiência e conectar seus treinos.
        </p>
      </section>

      <SectionCard
        title="Vamos deixar tudo pronto"
        description="Conclua estas etapas para aproveitar todos os recursos do RYVANO."
        action={
          <StatusBadge tone={completedSteps === steps.length ? "success" : "warning"}>
            {`${completedSteps} de ${steps.length} concluídas`}
          </StatusBadge>
        }
      >
        <div className="space-y-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,oklch(0.83_0.11_220),oklch(0.79_0.14_165))] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="grid gap-3 xl:grid-cols-5">
            {steps.map((step) => {
              const active = step.id === activeStep?.id;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goToStep(step.id)}
                  className={`min-h-[96px] rounded-[20px] border px-4 py-4 text-left transition ${
                    active
                      ? "border-white/18 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                      : "border-white/10 bg-white/5 hover:bg-white/8"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold tracking-[0.18em] text-foreground/48">
                      {step.complete ? "✓" : step.number}
                    </span>
                    <StatusBadge tone={step.complete ? "success" : "warning"}>
                      {step.complete ? "Concluído" : "Pendente"}
                    </StatusBadge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm leading-6 text-foreground/60">{step.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {activeStepId === "step-1" || activeStepId === "step-2" || activeStepId === "step-3" ? (
        <OnboardingForm user={user} activeStepId={activeStepId} onStepChange={goToStep} />
      ) : null}

      {activeStepId === "step-4" ? <ScreenGarminConect connection={garminConnection} /> : null}

      {activeStepId === "step-5" ? (
        <SectionCard
          title="Ative seus relatórios no WhatsApp"
          description="Confirme seu número para receber os resumos dos seus treinos."
          action={
            <StatusBadge tone={whatsapp.verified ? "success" : "warning"}>
              {whatsapp.verified ? "WhatsApp conectado" : "Aguardando confirmação"}
            </StatusBadge>
          }
        >
          <WhatsAppActivationCard phone={whatsapp.phone} verified={whatsapp.verified} />
        </SectionCard>
      ) : null}
    </div>
  );
}
