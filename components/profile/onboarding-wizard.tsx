"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = Boolean(prefersReducedMotion);
  const [activeStepId, setActiveStepId] = useState(initialStepId);
  const activePanelRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusPanelRef = useRef(false);
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

  useEffect(() => {
    if (!shouldFocusPanelRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const panel = activePanelRef.current;

      if (!panel) {
        shouldFocusPanelRef.current = false;
        return;
      }

      panel.scrollIntoView({ block: "start", behavior: "smooth" });

      const focusTarget = panel.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );

      (focusTarget ?? panel).focus();
      shouldFocusPanelRef.current = false;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeStepId]);

  const goToStep = (stepId: string) => {
    shouldFocusPanelRef.current = true;
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
      <motion.section
        className="px-1 pt-1"
        initial={reducedMotion ? false : { opacity: 0, y: 18, filter: "blur(10px)" }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.15rem]">
          Configure sua conta
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/68 sm:text-base">
          Complete as informações abaixo para personalizar sua experiência e conectar seus treinos.
        </p>
      </motion.section>

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 22, filter: "blur(14px)" }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.65, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
      >
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
            <div className="relative h-1.5 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className="h-full rounded-full bg-[linear-gradient(90deg,oklch(0.83_0.11_220),oklch(0.79_0.14_165))]"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ duration: reducedMotion ? 0.2 : 0.55, ease: [0.22, 1, 0.36, 1] }}
              />
              {reducedMotion ? null : (
                <motion.div
                  className="pointer-events-none absolute inset-y-0 w-16 rounded-full bg-white/30 blur-md"
                  animate={{ x: ["-20%", "220%"] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
                />
              )}
            </div>

            <div className="grid gap-3 xl:grid-cols-4">
              {steps.map((step, index) => {
                const active = step.id === activeStep?.id;

                return (
                  <motion.button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(step.id)}
                    whileHover={reducedMotion ? undefined : { y: -3, scale: 1.01 }}
                    whileTap={reducedMotion ? undefined : { scale: 0.985 }}
                    animate={
                      active && !reducedMotion
                        ? {
                            y: [0, -2, 0],
                            boxShadow: [
                              "0 0 0 rgba(133,221,255,0)",
                              "0 14px 40px rgba(133,221,255,0.08)",
                              "0 0 0 rgba(133,221,255,0)",
                            ],
                          }
                        : undefined
                    }
                    transition={
                      active && !reducedMotion
                        ? {
                            duration: 4,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: index * 0.08,
                          }
                        : { duration: 0.2 }}
                    className={`relative min-h-[96px] overflow-hidden rounded-[20px] border px-4 py-4 text-left transition focus-visible:outline-none ${
                      active
                        ? "border-white/18 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                        : "border-white/10 bg-white/5 hover:bg-white/8"
                    }`}
                  >
                    {active ? (
                      <motion.span
                        layoutId="onboarding-step-active-ring"
                        className="pointer-events-none absolute inset-0 rounded-[20px] ring-2 ring-[rgba(133,221,255,0.45)] ring-offset-2 ring-offset-transparent"
                        transition={{ type: "spring", stiffness: 340, damping: 28, mass: 0.75 }}
                      />
                    ) : null}
                    {active && !reducedMotion ? (
                      <motion.span
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(133,221,255,0.16),transparent_58%)]"
                        animate={{ opacity: [0.45, 0.85, 0.45] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                      />
                    ) : null}
                    <div className="relative z-10 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold tracking-[0.18em] text-foreground/48">
                        {step.complete ? "✓" : step.number}
                      </span>
                      <StatusBadge tone={step.complete ? "success" : "warning"}>
                        {step.complete ? "Concluído" : "Pendente"}
                      </StatusBadge>
                    </div>
                    <p className="relative z-10 mt-3 text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="relative z-10 mt-1 text-sm leading-6 text-foreground/60">{step.description}</p>
                    {active ? (
                      <motion.div
                        className="relative z-10 mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"
                        initial={false}
                        animate={{ opacity: 1 }}
                      >
                        <motion.div
                          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(133,221,255,0.95),rgba(88,205,170,0.9))]"
                          animate={reducedMotion ? { width: "42%" } : { width: ["24%", "62%", "24%"] }}
                          transition={reducedMotion ? { duration: 0.2 } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                        />
                      </motion.div>
                    ) : null}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </SectionCard>
      </motion.div>

      <AnimatePresence mode="wait" initial={false}>
        {activeStepId === "step-1" || activeStepId === "step-2" ? (
          <motion.div
            key={activeStepId}
            ref={activePanelRef}
            tabIndex={-1}
            className="outline-none focus-visible:ring-2 focus-visible:ring-[rgba(133,221,255,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.985, filter: "blur(10px)" }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -12, scale: 0.992, filter: "blur(8px)" }}
            transition={{ duration: reducedMotion ? 0.15 : 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <OnboardingForm user={user} activeStepId={activeStepId} onStepChange={goToStep} />
          </motion.div>
        ) : null}

        {activeStepId === "step-3" ? (
          <motion.div
            key="step-3"
            ref={activePanelRef}
            tabIndex={-1}
            className="outline-none focus-visible:ring-2 focus-visible:ring-[rgba(133,221,255,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.985, filter: "blur(10px)" }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -12, scale: 0.992, filter: "blur(8px)" }}
            transition={{ duration: reducedMotion ? 0.15 : 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <ScreenGarminConect connection={garminConnection} />
          </motion.div>
        ) : null}

        {activeStepId === "step-4" ? (
          <motion.div
            key="step-4"
            ref={activePanelRef}
            tabIndex={-1}
            className="outline-none focus-visible:ring-2 focus-visible:ring-[rgba(133,221,255,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.985, filter: "blur(10px)" }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -12, scale: 0.992, filter: "blur(8px)" }}
            transition={{ duration: reducedMotion ? 0.15 : 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
