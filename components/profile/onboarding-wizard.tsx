"use client";

import {
  IconActivityHeartbeat,
  IconBrandWhatsapp,
  IconChecklist,
  IconMapPin,
  IconUser,
} from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { WhatsAppActivationCard } from "@/components/integrations/whatsapp-activation-card";
import { OnboardingForm } from "@/components/profile/onboarding-form";
import { OnboardingWearableStep } from "@/components/profile/onboarding-wearable-step";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import type { IntegrationCardViewModel } from "@/modules/shared/integrations/presentation";

type OnboardingStep = {
  id: string;
  number: string;
  title: string;
  description: string;
  complete: boolean;
  /** Etapas opcionais não bloqueiam a conclusão do onboarding (ex.: wearable). */
  optional?: boolean;
};

type OnboardingWizardProps = {
  steps: readonly OnboardingStep[];
  initialStepId: string;
  user: {
    name: string | null;
    email: string;
    image?: string | null;
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
  /** Cards de providers esportivos (catálogo + conexões) para o passo wearable. */
  wearableProviders: {
    connected: IntegrationCardViewModel[];
    available: IntegrationCardViewModel[];
  };
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
  wearableProviders,
  whatsapp,
}: OnboardingWizardProps) {
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = Boolean(prefersReducedMotion);
  const [activeStepId, setActiveStepId] = useState(initialStepId);
  const activePanelRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusPanelRef = useRef(false);
  const completedSteps = useMemo(() => steps.filter((step) => step.complete).length, [steps]);
  // Etapas opcionais não concluídas não contam para o denominador, de modo que
  // o onboarding possa chegar a 100% sem conectar um provider (Req 14.1).
  const trackedSteps = useMemo(
    () => steps.filter((step) => !step.optional || step.complete),
    [steps],
  );
  const progress = trackedSteps.length
    ? Math.round((completedSteps / trackedSteps.length) * 100)
    : 100;
  const activeStep = steps.find((step) => step.id === activeStepId) ?? steps[0];
  const nextStepId = useMemo(() => {
    const index = steps.findIndex((step) => step.id === activeStepId);
    return index >= 0 && index < steps.length - 1 ? steps[index + 1]?.id ?? null : null;
  }, [activeStepId, steps]);

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
        className="relative overflow-hidden rounded-[28px] px-5 py-6 sm:px-6"
        initial={reducedMotion ? false : { opacity: 0, y: 18, filter: "blur(10px)" }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top_left,rgba(133,221,255,0.14),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(88,205,170,0.12),transparent_35%)]" />
        {reducedMotion ? null : (
          <>
            <motion.span
              className="pointer-events-none absolute -left-8 top-4 h-28 w-28 rounded-full bg-[rgba(133,221,255,0.12)] blur-3xl"
              animate={{ x: [0, 12, 0], y: [0, -10, 0], scale: [1, 1.08, 1] }}
              transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-[rgba(88,205,170,0.1)] blur-3xl"
              animate={{ x: [0, -10, 0], y: [0, 8, 0], scale: [1, 1.12, 1] }}
              transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </>
        )}

        <div className="relative z-10 flex items-start gap-4">
          <UserAvatar name={user.name ?? user.email} image={user.image} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <motion.div
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/7 px-3 py-2 text-xs font-semibold tracking-[0.18em] text-foreground/74"
                animate={reducedMotion ? undefined : { y: [0, -2, 0] }}
                transition={reducedMotion ? undefined : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <IconChecklist size={18} stroke={2} />
                CONFIGURAÇÃO GUIADA
              </motion.div>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-2 text-xs font-medium text-foreground/64">
                <span>Progresso</span>
                <AnimatedCount value={progress} reducedMotion={reducedMotion} suffix="%" />
              </div>
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2.15rem]">
              Configure sua conta
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/68 sm:text-base">
              Complete as informações abaixo para personalizar sua experiência e conectar seus treinos.
            </p>
          </div>
        </div>
      </motion.section>

      <motion.div
        className="relative"
        initial={reducedMotion ? false : { opacity: 0, y: 22, filter: "blur(14px)" }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.65, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
      >
        <SectionCard
          title="Vamos deixar tudo pronto"
          description="Conclua estas etapas para aproveitar todos os recursos do RYVANO."
          action={
            <StatusBadge tone={completedSteps === trackedSteps.length ? "success" : "warning"}>
              {`${completedSteps} de ${trackedSteps.length} concluídas`}
            </StatusBadge>
          }
        >
          <div className="relative space-y-4 overflow-hidden">
            {reducedMotion ? null : (
              <>
                <motion.span
                  className="pointer-events-none absolute left-10 top-8 h-2 w-2 rounded-full bg-[rgba(133,221,255,0.42)]"
                  animate={{ y: [0, -8, 0], opacity: [0.2, 0.9, 0.2] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.span
                  className="pointer-events-none absolute right-12 top-20 h-2.5 w-2.5 rounded-full bg-[rgba(88,205,170,0.4)]"
                  animate={{ y: [0, 9, 0], opacity: [0.25, 0.95, 0.25] }}
                  transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.span
                  className="pointer-events-none absolute bottom-6 left-1/3 h-1.5 w-1.5 rounded-full bg-white/40"
                  animate={{ y: [0, -7, 0], opacity: [0.15, 0.8, 0.15] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                />
              </>
            )}

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
                        : { duration: 0.2 }
                    }
                    className={`relative min-h-[112px] overflow-hidden rounded-[20px] border px-4 py-4 text-left transition focus-visible:outline-none ${
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

                    <div className="relative z-10 flex items-start justify-between gap-3">
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/10 text-foreground/82">
                        <StepIcon stepId={step.id} active={active} reducedMotion={reducedMotion} />
                      </div>
                      <StatusBadge tone={step.complete ? "success" : step.optional ? "neutral" : "warning"}>
                        {step.complete ? "Concluído" : step.optional ? "Opcional" : "Pendente"}
                      </StatusBadge>
                    </div>

                    <div className="relative z-10 mt-3 flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-foreground/48">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={step.complete ? `${step.id}-done` : `${step.id}-number`}
                          initial={reducedMotion ? false : { opacity: 0, scale: 0.65, y: 6, rotate: -10 }}
                          animate={reducedMotion ? undefined : { opacity: 1, scale: 1, y: 0, rotate: 0 }}
                          exit={reducedMotion ? undefined : { opacity: 0, scale: 0.65, y: -6, rotate: 10 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {step.complete ? "✓" : step.number}
                        </motion.span>
                      </AnimatePresence>
                      {active ? <span>Etapa ativa</span> : null}
                    </div>

                    <p className="relative z-10 mt-3 text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="relative z-10 mt-1 text-sm leading-6 text-foreground/60">{step.description}</p>

                    {active ? (
                      <motion.div className="relative z-10 mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" initial={false} animate={{ opacity: 1 }}>
                        <motion.div
                          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(133,221,255,0.95),rgba(88,205,170,0.9))]"
                          animate={reducedMotion ? { width: "42%" } : { width: ["24%", "62%", "24%"] }}
                          transition={reducedMotion ? { duration: 0.2 } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                        />
                        {reducedMotion ? null : (
                          <motion.div
                            className="pointer-events-none absolute inset-y-0 w-8 rounded-full bg-white/30 blur-md"
                            animate={{ x: ["-20%", "180%"] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                          />
                        )}
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
            <OnboardingWearableStep
              connected={wearableProviders.connected}
              available={wearableProviders.available}
              garminConnection={garminConnection}
              onContinue={() => goToStep(nextStepId ?? "step-4")}
            />
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

function StepIcon({
  stepId,
  active,
  reducedMotion,
}: {
  stepId: string;
  active: boolean;
  reducedMotion: boolean;
}) {
  const Icon =
    stepId === "step-1"
      ? IconUser
      : stepId === "step-2"
        ? IconMapPin
        : stepId === "step-3"
          ? IconActivityHeartbeat
          : IconBrandWhatsapp;

  return (
    <motion.div
      animate={active && !reducedMotion ? { rotate: [0, -6, 6, 0], scale: [1, 1.06, 1] } : undefined}
      transition={active && !reducedMotion ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" } : undefined}
    >
      <Icon size={18} stroke={1.9} />
    </motion.div>
  );
}

function AnimatedCount({
  value,
  reducedMotion,
  suffix = "",
}: {
  value: number;
  reducedMotion: boolean;
  suffix?: string;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    if (reducedMotion) {
      previousValueRef.current = value;
      return;
    }

    let frame = 0;
    const start = performance.now();
    const from = previousValueRef.current;
    const duration = 500;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(from + (value - from) * eased));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    previousValueRef.current = value;

    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion, value]);

  return <span className="font-semibold text-foreground">{reducedMotion ? value : displayValue}{suffix}</span>;
}
