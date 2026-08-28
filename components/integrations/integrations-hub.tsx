"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import {
  IconActivity,
  IconAlertTriangle,
  IconBolt,
  IconBrandWhatsapp,
  IconClock,
  IconDots,
  IconExternalLink,
  IconLoader2,
  IconMessageCircle,
  IconRefresh,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  disconnectGarminAction,
  generateWhatsAppActivationAction,
  sendWhatsAppTestMessageAction,
  syncGarminAction,
  type ActionState as IntegrationActionState,
} from "@/app/actions/integrations";
import { savePreferencesAction, type ActionState as ProfileActionState } from "@/app/actions/profile";
import { formatDistance, formatDuration } from "@/lib/format";

type GarminStatus = "CONNECTED" | "DISCONNECTED" | "SYNCING" | "ERROR" | "RECONNECT_REQUIRED";
type ActivationMonitorState = "idle" | "checking" | "confirmed" | "timed_out";

type IntegrationsHubProps = {
  garminConnection: {
    status: GarminStatus;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastErrorCode: string | null;
  } | null;
  reconnectNotification: {
    status: "SENT" | "FAILED";
    createdAt: string;
    reason: string | null;
    errorCode: string | null;
  } | null;
  whatsapp: {
    phone: string | null;
    verified: boolean;
    lastSentAt: string | null;
  };
  automations: {
    enabled: boolean;
    postActivityReport: boolean;
    dailySummary: boolean;
    reportTime: string | null;
    timezone: string | null;
  } | null;
  latestActivity: {
    name: string | null;
    sportType: string;
    distanceMeters: number | null;
    durationSeconds: number | null;
  } | null;
  autoOpenGarminConnect?: boolean;
};

type NoticeTone = "success" | "warning" | "danger" | "neutral";
type SemanticTone = "neutral" | "success" | "warning" | "danger" | "info";

type Notice = {
  tone: NoticeTone;
  title: string;
  description: string;
};

type AutomationDraft = {
  enabled: boolean;
  postActivityReport: boolean;
  dailySummary: boolean;
  reportTime: string;
  timezone: string;
};

type ActivationStatusResponse = {
  verified?: boolean;
};

const GarminScreen = dynamic(
  () => import("@/components/integrations/garmin/garminScreen").then((module) => module.GarminScreen),
  {
    ssr: false,
    loading: () => <GarminScreenLoading />,
  },
);

const integrationInitialState: IntegrationActionState = {};
const profileInitialState: ProfileActionState = {};
const activationCheckIntervalMs = 20_000;
const activationCheckWindowMs = 60_000;
const activationMaxChecks = activationCheckWindowMs / activationCheckIntervalMs;
const easeCurve = [0.22, 1, 0.36, 1] as const;

export function IntegrationsHub({
  garminConnection,
  reconnectNotification,
  whatsapp,
  automations,
  latestActivity,
  autoOpenGarminConnect = false,
}: IntegrationsHubProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [garminModalOpen, setGarminModalOpen] = useState(autoOpenGarminConnect);
  const [garminDetailsOpen, setGarminDetailsOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [garminMenuOpen, setGarminMenuOpen] = useState(false);
  const [garminNotice, setGarminNotice] = useState<Notice | null>(null);
  const [whatsAppNotice, setWhatsAppNotice] = useState<Notice | null>(null);
  const [isVerified, setIsVerified] = useState(whatsapp.verified);
  const [monitorState, setMonitorState] = useState<ActivationMonitorState>(whatsapp.verified ? "confirmed" : "idle");
  const [checksCompleted, setChecksCompleted] = useState(0);
  const [lastWhatsAppSendAt, setLastWhatsAppSendAt] = useState(whatsapp.lastSentAt);
  const [activationState, activationFormAction] = useActionState(generateWhatsAppActivationAction, integrationInitialState);
  const [isSyncing, startSyncTransition] = useTransition();
  const [isDisconnecting, startDisconnectTransition] = useTransition();
  const [isSendingTest, startTestTransition] = useTransition();
  const [automationDraft, setAutomationDraft] = useState<AutomationDraft>(() => getAutomationDraft(automations));
  const whatsappVerified = isVerified || whatsapp.verified;

  useEffect(() => {
    if (!garminMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setGarminMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [garminMenuOpen]);

  useEffect(() => {
    if (!garminModalOpen && !garminDetailsOpen && !disconnectDialogOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [disconnectDialogOpen, garminDetailsOpen, garminModalOpen]);

  useEffect(() => {
    if (!activationState.activationUrl || !activationState.expiresAt || whatsappVerified) {
      return;
    }

    let active = true;

    const readStatus = async () => {
      const response = await fetch("/api/whatsapp/activation/status", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("WHATSAPP_ACTIVATION_STATUS_CHECK_FAILED");
      }

      return response.json() as Promise<ActivationStatusResponse>;
    };

    const stopChecking = (timedOut = false) => {
      if (!active) {
        return;
      }

      stop();
      setMonitorState(timedOut ? "timed_out" : "idle");
    };

    const confirmActivation = () => {
      if (!active) {
        return;
      }

      stop();
      setIsVerified(true);
      setMonitorState("confirmed");
      setWhatsAppNotice({
        tone: "success",
        title: "WhatsApp conectado",
        description: "Seu número foi confirmado. Seus relatórios e alertas já podem ser enviados.",
      });
      router.refresh();
    };

    const runCheck = async () => {
      try {
        const payload = await readStatus();

        if (payload.verified) {
          confirmActivation();
          return true;
        }
      } catch {
        return false;
      }

      return false;
    };

    queueMicrotask(() => {
      if (!active) {
        return;
      }

      setMonitorState("checking");
      setChecksCompleted(0);
    });

    const intervalId = window.setInterval(() => {
      setChecksCompleted((current) => Math.min(current + 1, activationMaxChecks));
      void runCheck();
    }, activationCheckIntervalMs);

    const timeoutId = window.setTimeout(async () => {
      const confirmed = await runCheck();

      if (!confirmed) {
        stopChecking(true);
      }
    }, activationCheckWindowMs);

    const stop = () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };

    return () => {
      active = false;
      stop();
    };
  }, [activationState.activationUrl, activationState.expiresAt, router, whatsappVerified]);

  const garminUiState = getGarminUiState(garminConnection);
  const garminError = getGarminErrorContent(garminConnection);
  const automationSummary = getAutomationSummary(automationDraft);
  const issueCount = getIssueCount({ garminUiState, isVerified: whatsappVerified, phone: whatsapp.phone });
  const overallOk = issueCount === 0;
  const showActivationLink = Boolean(activationState.activationUrl && !whatsappVerified && monitorState !== "timed_out");

  const sectionMotion = reducedMotion
    ? undefined
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.32, ease: easeCurve },
      };

  return (
    <div className="space-y-6 pb-2">
      <motion.section
        {...sectionMotion}
        className="glass rounded-[28px] border border-white/10 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_40px_rgba(0,0,0,0.12)] sm:px-6 sm:py-6"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/78">Conexões e automações</p>
            <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[32px]">Integrações</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground/68 sm:text-[15px]">
              Conecte seus dispositivos e escolha como a RYVANO acompanha seus treinos e envia seus insights.
            </p>
          </div>

          <Badge tone={overallOk ? "success" : "warning"} className="self-start px-4 py-2 text-sm">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-current" aria-hidden="true" />
            {overallOk ? "Tudo funcionando" : `${issueCount} integração${issueCount > 1 ? "ões" : ""} requer atenção`}
          </Badge>
        </div>
      </motion.section>

      <section className="grid gap-4 xl:grid-cols-3">
        {[
          {
            key: "garmin",
            icon: <GarminMark className="h-5 w-5 text-cyan-200" />,
            label: "GARMIN",
            value: garminUiState.summaryLabel,
            secondary: garminUiState.summarySecondary,
            tone: garminUiState.summaryTone,
          },
          {
            key: "whatsapp",
            icon: <IconBrandWhatsapp size={20} stroke={1.8} className="text-[#25D366]" />,
            label: "WHATSAPP",
            value: whatsappVerified ? "Ativo" : whatsapp.phone ? "Pendente" : "Desconectado",
            secondary: whatsappVerified ? "Número confirmado" : whatsapp.phone ? "Confirmação pendente" : "Adicione seu número",
            tone: (whatsappVerified ? "success" : whatsapp.phone ? "warning" : "neutral") as SemanticTone,
          },
          {
            key: "automations",
            icon: <IconBolt size={20} stroke={1.8} className="text-cyan-200" />,
            label: "AUTOMAÇÕES",
            value: `${automationSummary.activeCount} de 2 ativas`,
            secondary: automationSummary.secondary,
            tone: (automationSummary.activeCount > 0 ? "info" : "neutral") as SemanticTone,
          },
        ].map((item, index) => (
          <AnimatedCard key={item.key} index={index} className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {item.icon}
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground/52">{item.label}</p>
              </div>
              <SummaryDot tone={item.tone} />
            </div>
            <p className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-foreground">{item.value}</p>
            <p className="mt-1 text-sm text-foreground/62">{item.secondary}</p>
          </AnimatedCard>
        ))}
      </section>

      <motion.section {...sectionMotion} transition={{ duration: 0.32, delay: 0.05, ease: easeCurve }} className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">Suas conexões</h2>
            <p className="mt-1 text-sm leading-7 text-foreground/65">
              Seus serviços conectados à RYVANO e o status de sincronização de cada um.
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <AnimatedCard index={0} className="glass rounded-[28px] border border-white/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_40px_rgba(0,0,0,0.12)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/14 bg-cyan-400/10 shadow-[0_12px_28px_rgba(34,211,238,0.12)]">
                  <GarminMark className="h-6 w-6 text-cyan-100" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Garmin</h3>
                  <p className="text-sm text-foreground/58">Treinos e métricas</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge tone={garminUiState.badgeTone}>{garminUiState.badgeLabel}</Badge>

                {garminUiState.showMenu ? (
                  <div ref={menuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setGarminMenuOpen((current) => !current)}
                      className="glass-button inline-flex h-10 w-10 items-center justify-center rounded-2xl text-foreground/76"
                      aria-expanded={garminMenuOpen}
                      aria-label="Abrir ações do Garmin"
                    >
                      <IconDots size={18} stroke={1.8} />
                    </button>

                    <AnimatePresence>
                      {garminMenuOpen ? (
                        <motion.div
                          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                          exit={reducedMotion ? undefined : { opacity: 0, y: 8 }}
                          transition={{ duration: 0.16 }}
                          className="absolute right-0 top-12 z-20 w-60 rounded-[20px] border border-white/10 bg-[#07131a]/95 p-2 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl"
                        >
                          <MenuAction
                            onClick={() => {
                              setGarminMenuOpen(false);
                              setGarminModalOpen(true);
                            }}
                            label={garminUiState.reconnectLabel}
                          />
                          <MenuAction
                            onClick={() => {
                              setGarminMenuOpen(false);
                              setGarminDetailsOpen(true);
                            }}
                            label="Ver detalhes da conexão"
                          />
                          <MenuAction
                            onClick={() => {
                              setGarminMenuOpen(false);
                              setDisconnectDialogOpen(true);
                            }}
                            label="Desconectar Garmin"
                            danger
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <p className="text-sm leading-7 text-foreground/66">
                {garminUiState.connectedLike
                  ? "Garmin conectada e sincronizando seus treinos automaticamente."
                  : "Conecte sua conta Garmin para importar seus treinos automaticamente para a RYVANO."}
              </p>

              {garminNotice ? <NoticeBanner notice={garminNotice} /> : null}

              {garminError ? (
                <div className="theme-panel-warning rounded-[22px] border px-4 py-4 text-sm">
                  <div className="flex items-start gap-3">
                    <IconAlertTriangle size={18} stroke={1.9} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{garminError.title}</p>
                      <p className="mt-1 leading-6 text-foreground/72">{garminError.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (garminUiState.connectedLike) {
                              startSyncTransition(async () => {
                                const result = await syncGarminAction();
                                setGarminNotice(getGarminActionNotice(result));
                                router.refresh();
                              });
                            } else {
                              setGarminModalOpen(true);
                            }
                          }}
                          className="glass-button inline-flex items-center gap-2 rounded-[16px] px-4 py-2 text-sm font-medium text-foreground"
                        >
                          {isSyncing ? <IconLoader2 size={16} className="animate-spin" /> : <IconRefresh size={16} stroke={1.8} />}
                          {garminUiState.connectedLike ? "Tentar novamente" : garminUiState.reconnectLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => setGarminDetailsOpen(true)}
                          className="glass-button inline-flex items-center gap-2 rounded-[16px] px-4 py-2 text-sm font-medium text-foreground/80"
                        >
                          Ver detalhes
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {garminUiState.connectedLike ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <MetricPanel
                      label="Última sincronização"
                      value={garminConnection?.lastSyncAt ? formatFriendlyDateTime(garminConnection.lastSyncAt) : "Aguardando"}
                      helper={garminConnection?.lastSyncAt ? "Seus treinos são sincronizados automaticamente." : "Assim que um treino chegar, ele aparece aqui."}
                    />
                    <MetricPanel
                      label="Última atividade importada"
                      value={latestActivity ? getActivityTitle(latestActivity) : "Nenhuma atividade importada ainda"}
                      helper={latestActivity ? getActivitySummary(latestActivity) : "Conecte e sincronize para começar."}
                    />
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/[0.045] px-5 py-5">
                    <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-foreground/48">Status da sincronização</p>
                    <div className="mt-4 space-y-4">
                      <TimelineItem title={garminUiState.timelineTitle} description={garminUiState.timelineDescription} success={garminUiState.badgeTone === "success"} />
                      <TimelineItem
                        title="Última sincronização concluída"
                        description={garminConnection?.lastSyncAt ? formatFriendlyDateTime(garminConnection.lastSyncAt) : "Ainda sem histórico recente"}
                        success={Boolean(garminConnection?.lastSyncAt)}
                      />
                      <TimelineItem
                        title="Próxima sincronização automática"
                        description={garminUiState.nextSyncLabel}
                        success={garminUiState.connectedLike}
                        last
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        startSyncTransition(async () => {
                          const result = await syncGarminAction();
                          setGarminNotice(getGarminActionNotice(result));
                          router.refresh();
                        });
                      }}
                      className="glass-button-primary inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold"
                      aria-busy={isSyncing}
                    >
                      {isSyncing ? <IconLoader2 size={18} className="animate-spin" /> : <IconRefresh size={18} stroke={1.8} />}
                      {isSyncing ? "Sincronizando..." : "Sincronizar agora"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.04] px-5 py-5">
                  <p className="text-lg font-semibold text-foreground">Importe seus treinos automaticamente.</p>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-foreground/66">
                    Conecte sua conta Garmin e deixe a RYVANO acompanhar suas atividades sem precisar enviar nada manualmente.
                  </p>
                  <button
                    type="button"
                    onClick={() => setGarminModalOpen(true)}
                    className="glass-button-primary mt-5 inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold"
                  >
                    <IconRefresh size={18} stroke={1.8} />
                    {garminUiState.reconnectLabel}
                  </button>
                </div>
              )}
            </div>
          </AnimatedCard>

          <AnimatedCard index={1} className="glass rounded-[28px] border border-white/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_40px_rgba(0,0,0,0.12)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#25D366]/20 bg-[#25D366]/10 shadow-[0_12px_28px_rgba(37,211,102,0.14)]">
                  <IconBrandWhatsapp size={24} stroke={1.9} className="text-[#25D366]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">WhatsApp</h3>
                  <p className="text-sm text-foreground/58">Resumos e alertas</p>
                </div>
              </div>

              <Badge tone={whatsappVerified ? "success" : whatsapp.phone ? "warning" : "neutral"}>
                {whatsappVerified ? "Conectado" : whatsapp.phone ? "Aguardando confirmação" : "Desconectado"}
              </Badge>
            </div>

            <div className="mt-6 space-y-5">
              {whatsAppNotice ? <NoticeBanner notice={whatsAppNotice} /> : null}

              {whatsappVerified ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <MetricPanel
                      label="Número conectado"
                      value={maskPhone(whatsapp.phone) ?? "Adicione um telefone"}
                      helper="Número confirmado"
                    />
                    <MetricPanel
                      label="Último envio"
                      value={lastWhatsAppSendAt ? formatFriendlyDateTime(lastWhatsAppSendAt) : "Nenhuma mensagem enviada ainda"}
                      helper={lastWhatsAppSendAt ? "Mensagem mais recente enviada pela RYVANO." : "Seu primeiro relatório aparecerá aqui."}
                    />
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/[0.045] px-5 py-5">
                    <p className="text-sm leading-7 text-foreground/68">
                      WhatsApp conectado. Seus relatórios e alertas podem ser enviados para este número.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        startTestTransition(async () => {
                          const result = await sendWhatsAppTestMessageAction();
                          if (result.success) {
                            setLastWhatsAppSendAt(new Date().toISOString());
                          }

                          setWhatsAppNotice({
                            tone: result.success ? "success" : "warning",
                            title: result.success ? "Mensagem enviada" : "Não foi possível enviar agora",
                            description: result.message ?? (result.success ? "Seu teste foi enviado." : "Tente novamente em instantes."),
                          });
                        });
                      }}
                      className="glass-button-primary inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold"
                      aria-busy={isSendingTest}
                    >
                      {isSendingTest ? <IconLoader2 size={18} className="animate-spin" /> : <IconMessageCircle size={18} stroke={1.8} />}
                      {isSendingTest ? "Enviando teste..." : "Enviar mensagem de teste"}
                    </button>

                    <Link href="/app/perfil" className="glass-button inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold text-foreground/82">
                      <IconSettings size={18} stroke={1.8} />
                      Gerenciar WhatsApp
                    </Link>
                  </div>
                </>
              ) : whatsapp.phone ? (
                <>
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.045] px-5 py-5">
                    <p className="text-lg font-semibold text-foreground">Receba seus insights onde você já conversa todos os dias.</p>
                    <p className="mt-2 text-sm leading-7 text-foreground/66">
                      Conecte seu número para receber análises de treino, resumos e alertas.
                    </p>
                    <p className="mt-4 text-sm text-foreground/62">Número atual: {maskPhone(whatsapp.phone)}</p>
                  </div>

                  <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.04] px-5 py-5 text-sm text-foreground/70">
                    <p>1. Gere seu link de confirmação</p>
                    <p>2. Abra o WhatsApp</p>
                    <p>3. Envie a mensagem automática</p>
                    <p>4. Pronto</p>
                  </div>

                  {(activationState.message || showActivationLink || monitorState === "timed_out") ? (
                    <div className="theme-panel-neutral rounded-[22px] border px-4 py-4 text-sm">
                      {activationState.message ? <p>{activationState.message}</p> : null}

                      {monitorState === "checking" ? (
                        <div className="mt-3 space-y-1 text-xs text-foreground/60">
                          <p>Estamos verificando sua confirmação a cada 20 segundos.</p>
                          <p>Tentativas automáticas: {checksCompleted}/{activationMaxChecks}. Tempo máximo: 1 minuto.</p>
                        </div>
                      ) : null}

                      {monitorState === "confirmed" ? <p className="mt-3 font-medium text-foreground">WhatsApp confirmado. Atualizando tela...</p> : null}

                      {monitorState === "timed_out" ? (
                        <p className="mt-3 font-medium text-foreground">
                          Não conseguimos confirmar em 1 minuto. Gere um novo link para continuar.
                        </p>
                      ) : null}

                      {showActivationLink ? (
                        <div className="mt-4 space-y-3">
                          <a
                            href={activationState.activationUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="glass-button-primary inline-flex items-center gap-2 rounded-[16px] px-4 py-2 font-semibold"
                          >
                            <IconBrandWhatsapp size={16} stroke={1.8} />
                            Abrir WhatsApp e confirmar
                          </a>

                          <div>
                            <p className="text-xs text-foreground/55">Se botão não abrir, use link manual:</p>
                            <a
                              href={activationState.activationUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-center gap-2 break-all text-cyan-200 hover:text-foreground"
                            >
                              <IconExternalLink size={14} stroke={1.8} />
                              {activationState.activationUrl}
                            </a>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <form action={activationFormAction}>
                      <button
                        type="submit"
                        className="glass-button-primary inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold"
                        disabled={monitorState === "checking"}
                      >
                        {monitorState === "checking" ? <IconLoader2 size={18} className="animate-spin" /> : <IconBrandWhatsapp size={18} stroke={1.8} />}
                        {monitorState === "checking" ? "Verificando confirmação..." : "Confirmar no WhatsApp"}
                      </button>
                    </form>

                    <Link href="/app/perfil" className="glass-button inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold text-foreground/82">
                      <IconSettings size={18} stroke={1.8} />
                      Gerenciar número
                    </Link>
                  </div>
                </>
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.04] px-5 py-5">
                  <p className="text-lg font-semibold text-foreground">Conecte seu WhatsApp</p>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-foreground/66">
                    Adicione um telefone no seu perfil para receber análises de treino, resumos e alertas da RYVANO.
                  </p>
                  <Link href="/app/perfil" className="glass-button-primary mt-5 inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold">
                    <IconSettings size={18} stroke={1.8} />
                    Adicionar telefone
                  </Link>
                </div>
              )}
            </div>
          </AnimatedCard>
        </div>
      </motion.section>

      <motion.section {...sectionMotion} transition={{ duration: 0.32, delay: 0.1, ease: easeCurve }}>
        <AutomationsSection
          preference={automationDraft}
          whatsappReady={whatsappVerified}
          onChange={setAutomationDraft}
        />
      </motion.section>

      <motion.section {...sectionMotion} transition={{ duration: 0.32, delay: 0.15, ease: easeCurve }} className="space-y-4">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">Mais integrações estão chegando</h2>
          <p className="mt-1 text-sm leading-7 text-foreground/65">
            Estamos expandindo a RYVANO para conectar os principais dispositivos esportivos.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { name: "Apple Watch", description: "Saúde e atividades", icon: "simple-icons:apple" },
            { name: "Polar", description: "Treino e recuperação", icon: "simple-icons:polar" },
            { name: "COROS", description: "Desempenho esportivo", icon: "simple-icons:coros" },
            { name: "Suunto", description: "Aventura e endurance", icon: "simple-icons:suunto" },
            { name: "Fitbit", description: "Bem-estar e movimento", icon: "simple-icons:fitbit" },
          ].map((item, index) => (
            <AnimatedCard key={item.name} index={index} className="glass rounded-[24px] border border-white/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_40px_rgba(0,0,0,0.12)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-foreground/90">
                <Icon icon={item.icon} className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-foreground">{item.name}</h3>
              <p className="mt-2 text-sm text-foreground/60">{item.description}</p>
              <Badge tone="neutral" className="mt-4">Em breve</Badge>
            </AnimatedCard>
          ))}
        </div>
      </motion.section>

      <PortalDialog open={garminModalOpen} onClose={() => setGarminModalOpen(false)} className="max-w-6xl p-0">
        <GarminScreen
          connection={garminConnection ? {
            status: garminConnection.status,
            lastSyncAt: garminConnection.lastSyncAt ? new Date(garminConnection.lastSyncAt) : null,
            lastSyncStatus: garminConnection.lastSyncStatus,
          } : null}
          fullHeight
          onSuccess={() => {
            setGarminModalOpen(false);
            setGarminNotice({
              tone: "success",
              title: "Garmin conectada",
              description: "Seus treinos serão importados automaticamente.",
            });
            router.refresh();
          }}
        />
      </PortalDialog>

      <PortalDialog open={garminDetailsOpen} onClose={() => setGarminDetailsOpen(false)} className="max-w-xl p-0">
        <div className="glass-strong rounded-[28px] border border-white/10 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.34)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/78">Detalhes da conexão</p>
              <h3 className="mt-3 text-xl font-semibold text-foreground">Garmin</h3>
            </div>
            <button
              type="button"
              onClick={() => setGarminDetailsOpen(false)}
              className="glass-button inline-flex h-10 w-10 items-center justify-center rounded-2xl text-foreground/78"
              aria-label="Fechar detalhes da conexão"
            >
              <IconX size={18} stroke={1.8} />
            </button>
          </div>

          <div className="mt-6 space-y-4 text-sm text-foreground/72">
            <DetailRow label="Status" value={garminUiState.badgeLabel} />
            <DetailRow label="Última sincronização" value={garminConnection?.lastSyncAt ? formatFriendlyDateTime(garminConnection.lastSyncAt) : "—"} />
            <DetailRow label="Código interno" value={garminConnection?.lastErrorCode ?? reconnectNotification?.errorCode ?? "—"} />
            <DetailRow label="Último aviso" value={reconnectNotification?.createdAt ? formatFriendlyDateTime(reconnectNotification.createdAt) : "—"} />
            <DetailRow label="Origem do aviso" value={reconnectNotification?.reason === "admin" ? "Reenvio manual" : reconnectNotification ? "Aviso automático" : "—"} />
          </div>

          <div className="theme-panel-neutral mt-6 rounded-[22px] border px-4 py-4 text-sm leading-6">
            Se precisar de suporte, informe o código interno e o horário exibido acima para nossa equipe.
          </div>
        </div>
      </PortalDialog>

      <PortalDialog open={disconnectDialogOpen} onClose={() => setDisconnectDialogOpen(false)} className="max-w-lg p-0">
        <div className="glass-strong rounded-[28px] border border-white/10 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.34)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Desconectar Garmin?</h3>
              <p className="mt-3 text-sm leading-7 text-foreground/68">
                Novos treinos deixarão de ser sincronizados. As atividades já importadas permanecerão na sua conta.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDisconnectDialogOpen(false)}
              className="glass-button inline-flex h-10 w-10 items-center justify-center rounded-2xl text-foreground/78"
              aria-label="Fechar confirmação de desconexão"
            >
              <IconX size={18} stroke={1.8} />
            </button>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setDisconnectDialogOpen(false)}
              className="glass-button rounded-[18px] px-5 py-3 text-sm font-semibold text-foreground/82"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                startDisconnectTransition(async () => {
                  const result = await disconnectGarminAction();
                  setGarminNotice({
                    tone: result.success ? "success" : "warning",
                    title: result.success ? "Garmin desconectada" : "Não foi possível desconectar agora",
                    description: result.message ?? (result.success ? "Seu histórico foi preservado." : "Tente novamente em instantes."),
                  });
                  setDisconnectDialogOpen(false);
                  router.refresh();
                });
              }}
              className="inline-flex items-center gap-2 rounded-[18px] border border-red-400/20 bg-red-500/14 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/18"
              disabled={isDisconnecting}
            >
              {isDisconnecting ? <IconLoader2 size={18} className="animate-spin" /> : null}
              Desconectar Garmin
            </button>
          </div>
        </div>
      </PortalDialog>
    </div>
  );
}

function AutomationsSection({
  preference,
  whatsappReady,
  onChange,
}: {
  preference: AutomationDraft;
  whatsappReady: boolean;
  onChange: (draft: AutomationDraft) => void;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const successHandledRef = useRef(false);
  const [state, formAction] = useActionState(savePreferencesAction, profileInitialState);
  const [timezone] = useState("UTC");

  useEffect(() => {
    if (!state.success) {
      successHandledRef.current = false;
      return;
    }

    if (successHandledRef.current) {
      return;
    }

    successHandledRef.current = true;
    onChange({
      ...preference,
      timezone,
    });
    router.refresh();
  }, [onChange, preference, router, state.success, timezone]);

  const activeCount = preference.enabled ? Number(preference.postActivityReport) + Number(preference.dailySummary) : 0;
  const disabledDependents = !preference.enabled;

  return (
    <section className="glass rounded-[28px] border border-white/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_40px_rgba(0,0,0,0.12)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">Automações RYVANO</h2>
          <p className="mt-1 max-w-2xl text-sm leading-7 text-foreground/65">
            Escolha quando a RYVANO deve analisar seus treinos e enviar informações para você.
          </p>
        </div>

        <Badge tone={activeCount > 0 ? "info" : "neutral"}>{activeCount} ativa{activeCount === 1 ? "" : "s"}</Badge>
      </div>

      <form action={formAction} className="mt-6 space-y-4">
        {state.success ? (
          <div aria-live="polite" className="theme-panel-success rounded-[22px] border px-4 py-4 text-sm">
            <p className="font-semibold text-foreground">Preferência atualizada</p>
            <p className="mt-1 text-foreground/76">A próxima mensagem seguirá essa configuração.</p>
          </div>
        ) : null}

        {state.message && !state.success ? (
          <div aria-live="polite" className="theme-panel-warning rounded-[22px] border px-4 py-4 text-sm">
            <p className="font-semibold text-foreground">Não foi possível salvar agora</p>
            <p className="mt-1 text-foreground/76">{state.message}</p>
          </div>
        ) : null}

        {!whatsappReady ? (
          <div className="theme-panel-warning rounded-[22px] border px-4 py-4 text-sm leading-6">
            Confirme seu WhatsApp para receber relatórios e alertas. Você já pode salvar suas preferências agora.
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
          <AutomationCard
            icon={<IconMessageCircle size={20} stroke={1.8} className="text-cyan-200" />}
            title="Receber mensagens da RYVANO"
            description="Permite que a RYVANO envie seus relatórios e alertas pelo WhatsApp."
            checked={preference.enabled}
            onChange={(checked) => onChange({ ...preference, enabled: checked })}
            statusLabel={preference.enabled ? "Ativo" : "Inativo"}
          />

          <AutomationCard
            icon={<IconActivity size={20} stroke={1.8} className="text-cyan-200" />}
            title="Relatório após cada atividade"
            description="Receba uma análise no WhatsApp assim que um novo treino for sincronizado."
            checked={preference.postActivityReport}
            onChange={(checked) => onChange({ ...preference, postActivityReport: checked })}
            statusLabel={preference.postActivityReport && preference.enabled ? "Ativo" : "Inativo"}
            disabled={disabledDependents}
          />
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.045] px-5 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className={cn("pr-0 sm:pr-6", disabledDependents && "opacity-60")}>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/6">
                  <IconClock size={20} stroke={1.8} className="text-cyan-200" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Resumo diário</h3>
                  <p className="mt-1 text-sm leading-6 text-foreground/64">
                    Receba um resumo do seu dia com atividades, evolução e principais indicadores.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start">
              <span className="text-sm font-medium text-foreground/62">{preference.dailySummary && preference.enabled ? "Ativo" : "Inativo"}</span>
              <SwitchButton checked={preference.dailySummary} onChange={(checked) => onChange({ ...preference, dailySummary: checked })} disabled={disabledDependents} />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {preference.dailySummary ? (
              <motion.div
                key="daily-time"
                initial={reducedMotion ? false : { opacity: 0, height: 0, y: -4 }}
                animate={reducedMotion ? undefined : { opacity: 1, height: "auto", y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, height: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className={cn("mt-5 grid gap-4 border-t border-white/10 pt-5 md:grid-cols-[minmax(0,220px)_1fr] md:items-end", disabledDependents && "opacity-60")}>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground/74">Horário de envio</span>
                    <div className="glass-input rounded-[18px] px-4 py-3">
                      <input
                        type="time"
                        value={preference.reportTime}
                        onChange={(event) => onChange({ ...preference, reportTime: event.currentTarget.value })}
                        disabled={disabledDependents}
                        className="w-full bg-transparent text-sm text-foreground outline-none disabled:cursor-not-allowed"
                      />
                    </div>
                  </label>

                  <div className="rounded-[18px] border border-cyan-300/12 bg-cyan-400/8 px-4 py-3 text-sm text-foreground/74">
                    Envio diário com referência fixa da plataforma.
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {preference.enabled ? <input type="hidden" name="enabled" value="on" /> : null}
        {preference.postActivityReport ? <input type="hidden" name="postActivityReport" value="on" /> : null}
        {preference.dailySummary ? <input type="hidden" name="dailySummary" value="on" /> : null}
        <input type="hidden" name="weeklySummary" value="" />
        <input type="hidden" name="reportTime" value={preference.reportTime} />
        <input type="hidden" name="timezone" value={timezone} />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-sm text-foreground/58">Horário diário salvo com referência fixa da plataforma.</p>
          <button type="submit" className="glass-button-primary rounded-[18px] px-5 py-3 text-sm font-semibold">
            Salvar preferências
          </button>
        </div>
      </form>
    </section>
  );
}

function AutomationCard({
  icon,
  title,
  description,
  checked,
  onChange,
  statusLabel,
  disabled = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  statusLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("rounded-[24px] border border-white/10 bg-white/[0.045] px-5 py-5", disabled && "opacity-60")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/6">
            {icon}
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-foreground/64">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start">
          <span className="text-sm font-medium text-foreground/62">{statusLabel}</span>
          <SwitchButton checked={checked} onChange={onChange} disabled={disabled} />
        </div>
      </div>
    </div>
  );
}

function SwitchButton({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-14 items-center rounded-full border transition",
        checked
          ? "border-cyan-300/30 bg-gradient-to-r from-sky-400/90 via-cyan-400/90 to-teal-400/90 shadow-[0_10px_24px_rgba(34,211,238,0.22)]"
          : "border-white/12 bg-white/10",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "inline-block h-6 w-6 rounded-full bg-white shadow-[0_6px_18px_rgba(0,0,0,0.22)] transition-transform",
          checked ? "translate-x-7" : "translate-x-1",
        )}
      />
    </button>
  );
}

function GarminScreenLoading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl space-y-4 rounded-[28px] border border-white/10 bg-white/[0.045] p-6 animate-pulse">
        <div className="h-8 w-28 rounded-full bg-white/10" />
        <div className="h-12 w-full rounded-[16px] bg-white/10" />
        <div className="h-12 w-full rounded-[16px] bg-white/10" />
        <div className="h-12 w-40 rounded-[16px] bg-white/10" />
      </div>
    </div>
  );
}

function AnimatedCard({
  children,
  className,
  index,
}: {
  children: ReactNode;
  className?: string;
  index: number;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: index * 0.05, ease: easeCurve }}
      whileHover={reducedMotion ? undefined : { y: -2 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <div aria-live="polite" className={cn("rounded-[22px] border px-4 py-4 text-sm", noticeToneClassMap[notice.tone])}>
      <p className="font-semibold text-foreground">{notice.title}</p>
      <p className="mt-1 leading-6 text-foreground/76">{notice.description}</p>
    </div>
  );
}

function MetricPanel({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.045] px-5 py-5">
      <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-foreground/48">{label}</p>
      <p className="mt-3 text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-6 text-foreground/62">{helper}</p>
    </div>
  );
}

function TimelineItem({
  title,
  description,
  success,
  last = false,
}: {
  title: string;
  description: string;
  success: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex w-4 flex-col items-center">
        <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", success ? "bg-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.4)]" : "bg-white/28")} />
        {!last ? <span className="mt-1 h-full w-px bg-white/10" aria-hidden="true" /> : null}
      </div>
      <div className="pb-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm text-foreground/62">{description}</p>
      </div>
    </div>
  );
}

function Badge({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone: SemanticTone;
  className?: string;
}) {
  return <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium", badgeToneClassMap[tone], className)}>{children}</span>;
}

function SummaryDot({ tone }: { tone: SemanticTone }) {
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", dotToneClassMap[tone])} aria-hidden="true" />;
}

function MenuAction({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-left text-sm transition hover:bg-white/8",
        danger ? "text-red-100" : "text-foreground/82",
      )}
    >
      <span>{label}</span>
    </button>
  );
}

function PortalDialog({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[999] overflow-y-auto bg-black/70 p-2 sm:p-4 md:p-6">
      <div className="flex min-h-full items-center justify-center" onClick={onClose}>
        <div className={cn("w-full", className)} onClick={(event) => event.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[20px] border border-white/10 bg-white/[0.045] px-4 py-4">
      <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-foreground/48">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function GarminMark({ className = "" }: { className?: string }) {
  return <Icon icon="simple-icons:garmin" className={className} />;
}

function getGarminUiState(connection: IntegrationsHubProps["garminConnection"]) {
  const status = connection?.status ?? "DISCONNECTED";

  if (status === "CONNECTED") {
    return {
      connectedLike: true,
      showMenu: true,
      summaryTone: "success" as const,
      summaryLabel: "Conectado",
      summarySecondary: connection?.lastSyncAt ? formatRelativeSync(connection.lastSyncAt) : "Aguardando 1ª sincronização",
      badgeTone: "success" as const,
      badgeLabel: "Conectado",
      reconnectLabel: "Reconectar Garmin",
      timelineTitle: "Garmin conectada",
      timelineDescription: "Seus treinos são importados automaticamente.",
      nextSyncLabel: "Ativa",
    };
  }

  if (status === "SYNCING") {
    return {
      connectedLike: true,
      showMenu: true,
      summaryTone: "info" as const,
      summaryLabel: "Sincronizando",
      summarySecondary: "Atualizando agora",
      badgeTone: "info" as const,
      badgeLabel: "Sincronizando",
      reconnectLabel: "Reconectar Garmin",
      timelineTitle: "Sincronização em andamento",
      timelineDescription: "Estamos buscando seus treinos mais recentes.",
      nextSyncLabel: "Aguardando conclusão",
    };
  }

  if (status === "RECONNECT_REQUIRED") {
    return {
      connectedLike: false,
      showMenu: true,
      summaryTone: "warning" as const,
      summaryLabel: "Requer atenção",
      summarySecondary: "Reconecte para voltar a sincronizar",
      badgeTone: "warning" as const,
      badgeLabel: "Reconectar",
      reconnectLabel: "Reconectar Garmin",
      timelineTitle: "Reconexão necessária",
      timelineDescription: "Sua conexão precisa ser validada novamente.",
      nextSyncLabel: "Pausada até reconectar",
    };
  }

  if (status === "ERROR") {
    return {
      connectedLike: false,
      showMenu: true,
      summaryTone: "warning" as const,
      summaryLabel: "Falha recente",
      summarySecondary: "Tentaremos novamente automaticamente",
      badgeTone: "warning" as const,
      badgeLabel: "Atenção",
      reconnectLabel: "Reconectar Garmin",
      timelineTitle: "Falha temporária",
      timelineDescription: "Sua conexão continua salva, mas a última atualização falhou.",
      nextSyncLabel: "Nova tentativa automática",
    };
  }

  return {
    connectedLike: false,
    showMenu: false,
    summaryTone: "neutral" as const,
    summaryLabel: "Desconectado",
    summarySecondary: "Conecte para importar seus treinos",
    badgeTone: "neutral" as const,
    badgeLabel: "Desconectado",
    reconnectLabel: "Conectar Garmin",
    timelineTitle: "Garmin desconectada",
    timelineDescription: "Conecte sua conta para começar a importar seus treinos.",
    nextSyncLabel: "Inativa",
  };
}

function getGarminErrorContent(connection: IntegrationsHubProps["garminConnection"]) {
  if (!connection) {
    return null;
  }

  const errorCode = connection.lastErrorCode?.toLowerCase() ?? "";

  if (connection.status === "RECONNECT_REQUIRED") {
    if (errorCode.includes("mfa")) {
      return {
        title: "Sua conexão precisa ser refeita",
        description: "A Garmin solicitou uma nova validação da conta. Reconecte sua conta para voltar a sincronizar seus treinos.",
      };
    }

    if (errorCode.includes("locked") || errorCode.includes("bloquead") || errorCode.includes("password")) {
      return {
        title: "Não foi possível validar sua conta Garmin",
        description: "Sua conta Garmin precisa de atenção antes de uma nova conexão. Seus dados anteriores continuam disponíveis.",
      };
    }

    return {
      title: "Reconexão necessária",
      description: "Sua conexão com a Garmin precisa ser validada novamente para continuar sincronizando normalmente.",
    };
  }

  if (connection.status === "ERROR" || errorCode) {
    if (errorCode.includes("429") || errorCode.includes("rate limited")) {
      return {
        title: "Não foi possível sincronizar agora",
        description: "A Garmin recusou temporariamente uma nova tentativa de conexão. Seus dados continuam salvos e tentaremos novamente automaticamente.",
      };
    }

    return {
      title: "Não foi possível atualizar o Garmin",
      description: "Tivemos uma falha temporária ao conversar com a Garmin. Seus dados anteriores continuam disponíveis.",
    };
  }

  return null;
}

function getGarminActionNotice(result: IntegrationActionState): Notice {
  if (result.success) {
    return {
      tone: "success",
      title: "Tudo atualizado",
      description: "A última sincronização foi concluída agora.",
    };
  }

  return {
    tone: "warning",
    title: "Não conseguimos atualizar agora",
    description: result.message ?? "Sua conexão continua ativa. Vamos tentar novamente automaticamente.",
  };
}

function getAutomationDraft(automations: IntegrationsHubProps["automations"]): AutomationDraft {
  return {
    enabled: automations?.enabled ?? true,
    postActivityReport: automations?.postActivityReport ?? true,
    dailySummary: automations?.dailySummary ?? false,
    reportTime: automations?.reportTime ?? "18:00",
    timezone: automations?.timezone ?? "America/Sao_Paulo",
  };
}

function getAutomationSummary(draft: AutomationDraft) {
  const activeCount = draft.enabled ? Number(draft.postActivityReport) + Number(draft.dailySummary) : 0;

  if (!draft.enabled) {
    return {
      activeCount,
      secondary: "Mensagens pausadas",
    };
  }

  if (draft.postActivityReport) {
    return {
      activeCount,
      secondary: "Relatório pós-treino ativo",
    };
  }

  if (draft.dailySummary) {
    return {
      activeCount,
      secondary: `Resumo diário às ${draft.reportTime}`,
    };
  }

  return {
    activeCount,
    secondary: "Nenhuma automação ativa",
  };
}

function getIssueCount({
  garminUiState,
  isVerified,
  phone,
}: {
  garminUiState: ReturnType<typeof getGarminUiState>;
  isVerified: boolean;
  phone: string | null;
}) {
  let count = 0;

  if (garminUiState.badgeTone === "warning") {
    count += 1;
  }

  if (phone && !isVerified) {
    count += 1;
  }

  return count;
}

function getActivityTitle(activity: NonNullable<IntegrationsHubProps["latestActivity"]>) {
  return activity.name?.trim() || formatSportType(activity.sportType);
}

function getActivitySummary(activity: NonNullable<IntegrationsHubProps["latestActivity"]>) {
  return [activity.distanceMeters ? formatDistance(activity.distanceMeters) : null, activity.durationSeconds ? formatDuration(activity.durationSeconds) : null]
    .filter(Boolean)
    .join(" • ") || "Atividade importada com sucesso";
}

function formatSportType(value: string) {
  const normalized = value.toLowerCase();
  const labelMap: Record<string, string> = {
    running: "Corrida",
    trail_running: "Trail run",
    treadmill_running: "Corrida na esteira",
    road_biking: "Ciclismo",
    cycling: "Ciclismo",
    indoor_cycling: "Bike indoor",
    swimming: "Natação",
    pool_swimming: "Natação em piscina",
    open_water_swimming: "Natação em águas abertas",
    walking: "Caminhada",
    strength_training: "Treino de força",
    hiking: "Trilha",
    cardio_training: "Treino cardio",
  };

  if (labelMap[normalized]) {
    return labelMap[normalized];
  }

  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatRelativeSync(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));

  if (diffMinutes <= 1) {
    return "Sincronizado agora";
  }

  if (diffMinutes < 60) {
    return `Sincronizado há ${diffMinutes} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `Sincronizado há ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Sincronizado há ${diffDays} dia${diffDays > 1 ? "s" : ""}`;
}

function formatFriendlyDateTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (sameDay) {
    return `Hoje, ${time}`;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function maskPhone(value: string | null) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");

  if (digits.length >= 12 && digits.startsWith("55")) {
    const area = digits.slice(2, 4);
    const last4 = digits.slice(-4);
    return `+55 (${area}) •••••-${last4}`;
  }

  if (digits.length > 4) {
    return `+${digits.slice(0, Math.max(2, digits.length - 8))} ••••-${digits.slice(-4)}`;
  }

  return `•••${digits}`;
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const badgeToneClassMap = {
  neutral: "theme-pill-neutral",
  success: "theme-pill-success",
  warning: "theme-pill-warning",
  danger: "theme-pill-danger",
  info: "theme-pill-info",
};

const dotToneClassMap = {
  neutral: "bg-white/30",
  success: "bg-emerald-400 shadow-[0_0_14px_rgba(34,197,94,0.5)]",
  warning: "bg-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.42)]",
  danger: "bg-red-400 shadow-[0_0_14px_rgba(239,68,68,0.42)]",
  info: "bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.42)]",
};

const noticeToneClassMap = {
  neutral: "theme-panel-neutral",
  success: "theme-panel-success",
  warning: "theme-panel-warning",
  danger: "theme-panel-danger",
};
