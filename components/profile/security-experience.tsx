"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronRight,
  IconDeviceDesktop,
  IconKey,
  IconLock,
  IconShieldCheck,
  IconUserCheck,
} from "@tabler/icons-react";

import { ChangePasswordForm } from "@/components/profile/change-password-form";

type SecurityExperienceProps = {
  hasPassword: boolean;
  whatsappVerified: boolean;
};

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  show: {
    opacity: 1,
    y: 0,
  },
};

export function SecurityExperience({ hasPassword, whatsappVerified }: SecurityExperienceProps) {
  const reducedMotion = Boolean(useReducedMotion());

  const rows = [
    {
      label: "Senha",
      value: hasPassword ? "Criada" : "Acesso com Google",
      tone: hasPassword ? "success" : "warning",
      icon: hasPassword ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />,
    },
    {
      label: "WhatsApp",
      value: whatsappVerified ? "Verificado" : "Pendente",
      tone: whatsappVerified ? "success" : "warning",
      icon: whatsappVerified ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />,
    },
    {
      label: "Acesso",
      value: hasPassword ? "Senha ativa" : "Login externo",
      tone: "neutral",
      icon: <IconUserCheck size={16} />,
    },
  ] as const;

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={reducedMotion ? undefined : containerVariants}
      className="space-y-5"
    >
      <motion.section
        variants={reducedMotion ? undefined : itemVariants}
        transition={{ duration: 0.25 }}
        className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6"
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[22px] border border-white/10 bg-black/10 text-cyan-200 sm:h-[72px] sm:w-[72px]">
              <IconShieldCheck size={32} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-foreground/42">Segurança</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Segurança da conta</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/66">
                Proteja seu acesso, revise como você entra na RYVANO e mantenha sua senha sempre atualizada.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusChip
                  label={hasPassword ? "Senha ativa" : "Acesso com Google"}
                  tone={hasPassword ? "success" : "warning"}
                  icon={hasPassword ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
                />
                <StatusChip
                  label={whatsappVerified ? "WhatsApp verificado" : "WhatsApp pendente"}
                  tone={whatsappVerified ? "success" : "warning"}
                  icon={whatsappVerified ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
                />
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-[22px] border border-white/10 bg-black/10 px-4 py-4 xl:min-w-[280px]">
            <p className="text-sm font-medium text-foreground/78">Resumo rápido</p>
            <div className="mt-4 space-y-3">
              {rows.map((row) => (
                <StatusRow key={row.label} {...row} />
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <motion.section
          variants={reducedMotion ? undefined : itemVariants}
          transition={{ duration: 0.25 }}
          className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6"
        >
          <SectionHeader
            icon={<IconLock size={20} />}
            title="Alterar senha"
            description="Para sua segurança, confirme sua senha atual antes de escolher uma nova."
          />

          <div className="mt-5">
            <ChangePasswordForm />
          </div>
        </motion.section>

        <motion.div variants={reducedMotion ? undefined : itemVariants} transition={{ duration: 0.25 }} className="space-y-5">
          <aside className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6">
            <SectionHeader
              icon={<IconKey size={20} />}
              title="Boas práticas"
              description="Ações simples para manter sua conta protegida no dia a dia."
              compact
            />

            <div className="mt-5 space-y-3">
              <PracticeRow
                title="Revise sua senha com frequência"
                description="Use combinações longas, com letras e números, e evite repetir senhas de outros serviços."
              />
              <PracticeRow
                title="Observe mudanças no telefone"
                description="Quando seu número mudar, a confirmação do WhatsApp pode precisar ser feita novamente."
              />
              <PracticeRow
                title="Prefira acessos confiáveis"
                description="Evite entrar em dispositivos compartilhados quando estiver fora do seu ambiente habitual."
                last
              />
            </div>
          </aside>

          <aside className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6">
            <SectionHeader
              icon={<IconDeviceDesktop size={20} />}
              title="Acesso à conta"
              description="Como você entra hoje na plataforma."
              compact
            />

            <div className="mt-5 space-y-3">
              <StatusRow
                label="Método principal"
                value={hasPassword ? "Senha da conta" : "Conta Google"}
                tone={hasPassword ? "success" : "neutral"}
                icon={hasPassword ? <IconCheck size={16} /> : <IconChevronRight size={16} />}
              />
              <StatusRow
                label="Senha"
                value={hasPassword ? "Pode ser atualizada agora" : "Crie uma senha quando quiser"}
                tone={hasPassword ? "success" : "warning"}
                icon={hasPassword ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
              />
            </div>
          </aside>
        </motion.div>
      </div>
    </motion.div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 ${compact ? "" : "border-b border-white/10 pb-5"}`}>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/10 text-foreground/84">
        {icon}
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-7 text-foreground/65">{description}</p>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: "success" | "warning" | "neutral";
  icon: ReactNode;
}) {
  const toneClass = tone === "success" ? "theme-pill-success" : tone === "warning" ? "theme-pill-warning" : "theme-pill-neutral";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold tracking-[0.12em] ${toneClass}`}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

function StatusRow({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "neutral";
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/10 px-4 py-3">
      <p className="text-sm text-foreground/72">{label}</p>
      <div className={`inline-flex items-center gap-2 text-sm font-medium ${tone === "success" ? "text-emerald-300" : tone === "warning" ? "text-amber-300" : "text-foreground/72"}`}>
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}

function PracticeRow({ title, description, last = false }: { title: string; description: string; last?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex w-4 flex-col items-center">
        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.34)]" />
        {!last ? <span className="mt-1 h-full w-px bg-white/10" aria-hidden="true" /> : null}
      </div>
      <div className="pb-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-6 text-foreground/62">{description}</p>
      </div>
    </div>
  );
}
