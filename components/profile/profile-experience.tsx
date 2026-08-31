"use client";

import { useActionState, useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronRight,
  IconCircleOff,
  IconDeviceWatch,
  IconMail,
  IconMapPin,
  IconPhone,
  IconRuler,
  IconScale,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react";

import { saveProfileDetailsAction, type ActionState } from "@/app/actions/profile";
import { SubmitButton } from "@/components/submit-button";
import { ProfileAvatarUploader } from "@/components/profile/profile-avatar-uploader";

type GarminStatus = "CONNECTED" | "DISCONNECTED" | "SYNCING" | "ERROR" | "RECONNECT_REQUIRED" | null;

type ProfileExperienceProps = {
  user: {
    name: string;
    email: string;
    image?: string | null;
    cpf: string | null;
    phone: string | null;
    heightCm: number | null;
    weightKg: string | null;
    postalCode: string | null;
    number: string | null;
    complement: string | null;
    address: {
      street: string | null;
      district: string | null;
      city: string | null;
      state: string | null;
      country: string | null;
    };
    whatsappVerified: boolean;
    garminStatus: GarminStatus;
    notificationPreference: {
      postActivityReport: boolean;
      dailySummary: boolean;
      weeklySummary: boolean;
    } | null;
  };
};

type AddressLookup = {
  street: string;
  district: string;
  city: string;
  state: string;
  country: string;
};

type FormValues = {
  name: string;
  heightCm: string;
  weightKg: string;
  postalCode: string;
  number: string;
  complement: string;
};

const initialState: ActionState = {};
const easeCurve = [0.22, 1, 0.36, 1] as const;

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

export function ProfileExperience({ user }: ProfileExperienceProps) {
  const router = useRouter();
  const reducedMotion = Boolean(useReducedMotion());
  const [state, formAction] = useActionState(saveProfileDetailsAction, initialState);
  const [postalLoading, setPostalLoading] = useState(false);
  const [postalFeedback, setPostalFeedback] = useState<{ tone: "success" | "warning"; message: string } | null>(null);
  const [lookupAddress, setLookupAddress] = useState<AddressLookup | null>(null);

  const initialValues = useMemo<FormValues>(() => ({
    name: user.name,
    heightCm: user.heightCm?.toString() ?? "",
    weightKg: user.weightKg ?? "",
    postalCode: formatPostalCode(user.postalCode ?? ""),
    number: user.number ?? "",
    complement: user.complement ?? "",
  }), [user.complement, user.heightCm, user.name, user.number, user.postalCode, user.weightKg]);

  const [formValues, setFormValues] = useState<FormValues>(initialValues);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  const actionNotice = state.message
    ? {
        tone: state.success ? "success" : "danger",
        message: state.success ? "Perfil atualizado com sucesso." : state.message,
      }
    : null;

  const completion = useMemo(() => getProfileCompletion({
    name: formValues.name,
    email: user.email,
    phone: user.phone,
    heightCm: formValues.heightCm,
    weightKg: formValues.weightKg,
    postalCode: formValues.postalCode,
    address: lookupAddress ?? user.address,
    whatsappVerified: user.whatsappVerified,
  }), [formValues.heightCm, formValues.name, formValues.postalCode, formValues.weightKg, lookupAddress, user.address, user.email, user.phone, user.whatsappVerified]);

  const garminState = getGarminState(user.garminStatus);
  const accountRows = [
    {
      label: "WhatsApp",
      value: user.whatsappVerified ? "Verificado" : "Pendente",
      tone: user.whatsappVerified ? "success" : "warning",
      icon: user.whatsappVerified ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />,
    },
    {
      label: "Garmin",
      value: garminState.label,
      tone: garminState.tone,
      icon: garminState.icon,
    },
    {
      label: "Cadastro",
      value: completion.complete ? "Perfil completo" : `${completion.percentage}% completo`,
      tone: completion.complete ? "success" : "warning",
      icon: completion.complete ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />,
    },
  ] as const;

  const reportRows = [
    { label: "Pós-treino", value: user.notificationPreference?.postActivityReport ? "Ativado" : "Desativado" },
    { label: "Resumo diário", value: user.notificationPreference?.dailySummary ? "Ativado" : "Desativado" },
    { label: "Resumo semanal", value: user.notificationPreference?.weeklySummary ? "Ativado" : "Desativado" },
  ];

  const currentAddress = resolveCurrentAddress({
    postalCode: formValues.postalCode,
    number: formValues.number,
    complement: formValues.complement,
    lookupAddress,
    storedAddress: user.address,
    storedPostalCode: user.postalCode,
  });

  const dirty = isDirty(formValues, initialValues);
  const athleteDataMissing = !normalizeNumericString(formValues.heightCm) || !normalizeNumericString(formValues.weightKg);

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={reducedMotion ? undefined : containerVariants}
      className="space-y-5"
    >
      <AnimatePresence>
        {actionNotice ? (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: -8 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            className={`rounded-[22px] border px-4 py-3 text-sm ${actionNotice.tone === "success" ? "theme-panel-success" : "theme-panel-danger"}`}
          >
            {actionNotice.message}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.section
        variants={reducedMotion ? undefined : itemVariants}
        transition={{ duration: 0.25 }}
        className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6"
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <ProfileAvatarUploader name={user.name} image={user.image} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-foreground/42">Seu perfil</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{user.name}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground/66">
                Mantenha seus dados atualizados para receber análises e relatórios mais personalizados.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <HeroStatusChip
                  label={user.whatsappVerified ? "WhatsApp verificado" : "WhatsApp pendente"}
                  tone={user.whatsappVerified ? "success" : "warning"}
                  icon={user.whatsappVerified ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
                />
                <HeroStatusChip label={garminState.heroLabel} tone={garminState.tone} icon={garminState.icon} />
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-[22px] border border-white/10 bg-black/10 px-4 py-4 xl:min-w-[280px]">
            <p className="text-sm font-medium text-foreground/78">Perfil</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {completion.complete ? "Perfil completo" : `${completion.percentage}% completo`}
            </p>
            {completion.complete ? (
              <p className="mt-2 text-sm text-emerald-300">Tudo pronto para personalizar suas análises.</p>
            ) : (
              <>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/8">
                  <motion.div
                    className="h-full rounded-full bg-[linear-gradient(90deg,rgba(56,189,248,0.95),rgba(34,211,238,0.95))]"
                    initial={reducedMotion ? false : { width: 0 }}
                    animate={{ width: `${completion.percentage}%` }}
                    transition={{ duration: reducedMotion ? 0.1 : 0.7, ease: easeCurve }}
                  />
                </div>
                <p className="mt-3 text-sm text-foreground/62">Complete os dados do atleta e mantenha seu endereço atualizado.</p>
              </>
            )}
          </div>
        </div>
      </motion.section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.5fr)]">
        <motion.form
          action={formAction}
          variants={reducedMotion ? undefined : itemVariants}
          transition={{ duration: 0.25 }}
          className="space-y-5"
        >
          <section className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6">
            <SectionHeader
              icon={<IconUser size={20} />}
              title="Informações pessoais"
              description="Dados principais vinculados à sua conta RYVANO."
            />

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <EditableField
                label="Nome completo"
                name="name"
                value={formValues.name}
                onChange={(value) => setFormValues((current) => ({ ...current, name: value }))}
                placeholder="Seu nome completo"
              />

              <ReadOnlyInfoCard
                label="E-mail da conta"
                value={maskEmail(user.email)}
                helper="Vinculado ao login"
                icon={<IconMail size={16} />}
              />

              <ProtectedInfoCard
                label="CPF"
                value={maskCpf(user.cpf)}
                helper="Este dado é protegido. Entre em contato com o suporte caso precise alterá-lo."
              />

              <ProtectedInfoCard
                label="Telefone"
                value={maskPhone(user.phone)}
                helper={user.whatsappVerified ? "WhatsApp verificado" : "WhatsApp ainda não verificado"}
                helperTone={user.whatsappVerified ? "success" : "warning"}
                icon={<IconPhone size={16} />}
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6">
            <SectionHeader
              icon={<IconRuler size={20} />}
              title="Dados do atleta"
              description="Informações utilizadas para contextualizar suas métricas."
            />

            {athleteDataMissing ? (
              <div className="theme-panel-warning mt-5 rounded-[20px] border px-4 py-4 text-sm leading-6">
                <p className="font-medium">Complete seus dados do atleta</p>
                <p className="mt-1">Altura e peso ajudam a contextualizar algumas métricas.</p>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <MetricInputCard
                label="Altura"
                name="heightCm"
                value={formValues.heightCm}
                onChange={(value) => setFormValues((current) => ({ ...current, heightCm: value.replace(/[^\d]/g, "") }))}
                unit="cm"
                icon={<IconRuler size={16} />}
              />
              <MetricInputCard
                label="Peso"
                name="weightKg"
                value={formValues.weightKg}
                onChange={(value) => setFormValues((current) => ({ ...current, weightKg: applyWeightMask(value) }))}
                unit="kg"
                icon={<IconScale size={16} />}
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6">
            <SectionHeader
              icon={<IconMapPin size={20} />}
              title="Endereço"
              description="Informe seu CEP e complete os dados necessários."
            />

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <EditableField
                label="CEP"
                name="postalCode"
                value={formValues.postalCode}
                onChange={(value) => {
                  setFormValues((current) => ({ ...current, postalCode: formatPostalCode(value) }));
                  setPostalFeedback(null);
                  setLookupAddress(null);
                }}
                placeholder="00000-000"
                inputMode="numeric"
                onBlur={async () => {
                  const postalCode = formValues.postalCode.replace(/\D/g, "");

                  if (postalCode.length !== 8) {
                    setPostalFeedback({
                      tone: "warning",
                      message: "Não encontramos este CEP. Confira os números informados.",
                    });
                    setLookupAddress(null);
                    return;
                  }

                  if (postalCode === (user.postalCode ?? "") && user.address.street) {
                    setPostalFeedback({ tone: "success", message: "Endereço encontrado" });
                    setLookupAddress(null);
                    return;
                  }

                  setPostalLoading(true);
                  setPostalFeedback(null);

                  try {
                    const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, {
                      method: "GET",
                      cache: "no-store",
                    });
                    const payload = await response.json() as {
                      erro?: boolean;
                      logradouro?: string;
                      bairro?: string;
                      localidade?: string;
                      uf?: string;
                    };

                    if (!response.ok || payload.erro || !payload.logradouro || !payload.bairro || !payload.localidade || !payload.uf) {
                      setPostalFeedback({
                        tone: "warning",
                        message: "Não encontramos este CEP. Confira os números informados.",
                      });
                      setLookupAddress(null);
                      return;
                    }

                    setLookupAddress({
                      street: payload.logradouro,
                      district: payload.bairro,
                      city: payload.localidade,
                      state: payload.uf,
                      country: "Brasil",
                    });
                    setPostalFeedback({ tone: "success", message: "Endereço encontrado" });
                  } catch {
                    setPostalFeedback({
                      tone: "warning",
                      message: "Não foi possível concluir esta ação. Tente novamente.",
                    });
                    setLookupAddress(null);
                  } finally {
                    setPostalLoading(false);
                  }
                }}
                trailing={postalLoading ? <span className="text-xs text-foreground/56">Buscando...</span> : null}
              />

              <EditableField
                label="Número"
                name="number"
                value={formValues.number}
                onChange={(value) => setFormValues((current) => ({ ...current, number: value }))}
                placeholder="Número"
              />

              <div className="md:col-span-2">
                <EditableField
                  label="Complemento"
                  name="complement"
                  value={formValues.complement}
                  onChange={(value) => setFormValues((current) => ({ ...current, complement: value }))}
                  placeholder="Opcional"
                  required={false}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              {postalLoading ? <p className="text-foreground/58">Buscando endereço...</p> : null}
              {postalFeedback ? (
                <p className={`flex items-center gap-1.5 ${postalFeedback.tone === "success" ? "text-emerald-300" : "text-amber-300"}`}>
                  {postalFeedback.tone === "success" ? <IconCheck size={14} /> : null}
                  {postalFeedback.message}
                </p>
              ) : null}
            </div>

            <AnimatePresence mode="popLayout">
              {currentAddress ? (
                <motion.div
                  key={`${currentAddress.line1}-${currentAddress.line2}-${currentAddress.line3}`}
                  initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
                  className="theme-panel-neutral mt-5 rounded-[22px] border px-4 py-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground/46">Endereço encontrado</p>
                  <div className="mt-3 space-y-1 text-sm leading-7 text-foreground/76">
                    <p>{currentAddress.line1}</p>
                    <p>{currentAddress.line2}</p>
                    <p>{currentAddress.line3}</p>
                    {currentAddress.line4 ? <p>{currentAddress.line4}</p> : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-black/10 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {dirty ? (
                  <p className="text-sm font-medium text-amber-300">Alterações não salvas</p>
                ) : (
                  <p className="text-sm text-foreground/58">Tudo sincronizado com os dados atuais.</p>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                {dirty ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFormValues(initialValues);
                      setLookupAddress(null);
                      setPostalFeedback(null);
                    }}
                    className="glass-button rounded-[18px] px-4 py-3 text-sm font-semibold text-foreground"
                  >
                    Descartar
                  </button>
                ) : null}
                <SubmitButton
                  disabled={!dirty}
                  className="glass-button-primary rounded-[18px] px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                  pendingLabel="Salvando..."
                >
                  Salvar alterações
                </SubmitButton>
              </div>
            </div>
          </section>
        </motion.form>

        <motion.aside variants={reducedMotion ? undefined : itemVariants} transition={{ duration: 0.25 }} className="space-y-5">
          <SidebarCard
            title="Sua conta"
            description="Status rápido da sua conta e das integrações principais."
          >
            <div className="space-y-3">
              {accountRows.map((row) => (
                <StatusRow key={row.label} label={row.label} value={row.value} tone={row.tone} icon={row.icon} />
              ))}
            </div>
          </SidebarCard>

          <ShortcutCard
            href="/app/seguranca"
            title="Segurança"
            description="Gerencie senha e acesso à sua conta."
            icon={<IconShieldCheck size={20} />}
          />

          <div id="notificacoes" className="scroll-mt-28">
            <SidebarCard
              title="Relatórios e notificações"
              description="Resumo rápido do que está ativo para sua conta."
            >
              <div className="space-y-3">
                {reportRows.map((row) => (
                  <StatusRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    tone={row.value === "Ativado" ? "success" : "neutral"}
                    icon={row.value === "Ativado" ? <IconCheck size={16} /> : <IconCircleOff size={16} />}
                  />
                ))}
              </div>
            </SidebarCard>
          </div>
        </motion.aside>
      </div>
    </motion.div>
  );
}

function SectionHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-white/10 pb-5">
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

function EditableField({
  label,
  name,
  value,
  onChange,
  placeholder,
  inputMode,
  required = true,
  onBlur,
  trailing,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  required?: boolean;
  onBlur?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="flex min-h-[50px] items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.045] px-4 transition hover:border-white/14 focus-within:border-cyan-300/40 focus-within:ring-2 focus-within:ring-cyan-300/16">
        <input
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          onBlur={onBlur}
          required={required}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
        />
        {trailing}
      </div>
    </label>
  );
}

function MetricInputCard({
  label,
  name,
  value,
  onChange,
  unit,
  icon,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  icon: ReactNode;
}) {
  return (
    <label className="rounded-[22px] border border-white/10 bg-black/10 px-4 py-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/62">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-4 flex items-end gap-3">
        <input
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          className="w-full bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-foreground/28"
          placeholder="—"
        />
        <span className="pb-1 text-sm text-foreground/48">{unit}</span>
      </div>
    </label>
  );
}

function ReadOnlyInfoCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-4">
      <p className="text-sm font-medium text-foreground/72">{label}</p>
      <div className="mt-3 flex items-center gap-2 text-foreground/82">
        {icon}
        <p className="text-sm font-medium">{value}</p>
      </div>
      <p className="mt-2 text-xs text-foreground/48">{helper}</p>
    </div>
  );
}

function ProtectedInfoCard({
  label,
  value,
  helper,
  helperTone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  helperTone?: "neutral" | "success" | "warning";
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-4">
      <p className="text-sm font-medium text-foreground/72">{label}</p>
      <div className="mt-3 flex items-center gap-2 text-foreground">
        {icon}
        <p className="text-sm font-semibold">{value}</p>
      </div>
      <p className={`mt-2 text-xs ${helperTone === "success" ? "text-emerald-300" : helperTone === "warning" ? "text-amber-300" : "text-foreground/48"}`}>
        {helperTone === "success" ? (
          <span className="inline-flex items-center gap-1">
            <IconCheck size={12} />
            {helper}
          </span>
        ) : (
          helper
        )}
      </p>
    </div>
  );
}

function HeroStatusChip({
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

function SidebarCard({
  title,
  description,
  children,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  children: ReactNode;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6">
      <div className="border-b border-white/10 pb-5">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-7 text-foreground/65">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="glass-button mt-5 inline-flex items-center gap-2 rounded-[18px] px-4 py-3 text-sm font-semibold text-foreground">
          <span>{actionLabel}</span>
          <IconChevronRight size={16} />
        </Link>
      ) : null}
    </section>
  );
}

function ShortcutCard({ href, title, description, icon }: { href: string; title: string; description: string; icon: ReactNode }) {
  const reducedMotion = Boolean(useReducedMotion());

  return (
    <Link href={href} className="group block">
      <motion.section
        whileHover={reducedMotion ? undefined : { y: -2, scale: 1.005 }}
        transition={{ duration: 0.16, ease: easeCurve }}
        className="rounded-[24px] border border-white/10 bg-white/[0.045] p-[18px] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/10 text-foreground/84">
              {icon}
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-7 text-foreground/65">{description}</p>
          </div>
          <IconChevronRight size={18} className="mt-1 text-foreground/56 transition group-hover:translate-x-1" />
        </div>
      </motion.section>
    </Link>
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

function getProfileCompletion({
  name,
  email,
  phone,
  heightCm,
  weightKg,
  postalCode,
  address,
  whatsappVerified,
}: {
  name: string;
  email: string;
  phone: string | null;
  heightCm: string;
  weightKg: string;
  postalCode: string;
  address: AddressLookup | ProfileExperienceProps["user"]["address"];
  whatsappVerified: boolean;
}) {
  const checks = [
    Boolean(name.trim()),
    Boolean(email.trim()),
    Boolean(phone?.trim()),
    Boolean(normalizeNumericString(heightCm)),
    Boolean(normalizeNumericString(weightKg)),
    Boolean(postalCode.replace(/\D/g, "").length === 8 && address.street && address.city && address.state),
    whatsappVerified,
  ];

  const completed = checks.filter(Boolean).length;
  const percentage = Math.round((completed / checks.length) * 100);

  return {
    percentage,
    complete: completed === checks.length,
  };
}

function getGarminState(status: GarminStatus) {
  if (status === "CONNECTED") {
    return {
      label: "Conectado",
      heroLabel: "Garmin conectada",
      tone: "success" as const,
      icon: <IconCheck size={14} />,
    };
  }

  if (status === "RECONNECT_REQUIRED" || status === "ERROR" || status === "SYNCING") {
    return {
      label: "Precisa de atenção",
      heroLabel: "Garmin precisa de atenção",
      tone: "warning" as const,
      icon: <IconAlertTriangle size={14} />,
    };
  }

  return {
    label: "Desconectado",
    heroLabel: "Garmin desconectada",
    tone: "neutral" as const,
    icon: <IconDeviceWatch size={14} />,
  };
}

function resolveCurrentAddress({
  postalCode,
  number,
  complement,
  lookupAddress,
  storedAddress,
  storedPostalCode,
}: {
  postalCode: string;
  number: string;
  complement: string;
  lookupAddress: AddressLookup | null;
  storedAddress: ProfileExperienceProps["user"]["address"];
  storedPostalCode: string | null;
}) {
  const normalizedPostalCode = postalCode.replace(/\D/g, "");
  const source = lookupAddress ?? (normalizedPostalCode === (storedPostalCode ?? "") ? storedAddress : null);

  if (!source?.street || !source.city || !source.state) {
    return null;
  }

  return {
    line1: `${source.street}${number.trim() ? `, ${number.trim()}` : ""}`,
    line2: `${source.district ?? "Bairro"} · ${source.city} — ${source.state}`,
    line3: `CEP ${formatPostalCode(normalizedPostalCode)} · ${source.country ?? "Brasil"}`,
    line4: complement.trim() ? `Complemento: ${complement.trim()}` : null,
  };
}

function isDirty(current: FormValues, initial: FormValues) {
  return normalizeFormValues(current) !== normalizeFormValues(initial);
}

function normalizeFormValues(values: FormValues) {
  return JSON.stringify({
    name: values.name.trim(),
    heightCm: normalizeNumericString(values.heightCm),
    weightKg: normalizeNumericString(values.weightKg),
    postalCode: values.postalCode.replace(/\D/g, ""),
    number: values.number.trim(),
    complement: values.complement.trim(),
  });
}

function normalizeNumericString(value: string) {
  return value.replace(/,/g, ".").trim();
}

function applyWeightMask(value: string) {
  return value.replace(/[^\d.,]/g, "").replace(/,/g, ".");
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split("@");

  if (!localPart || !domain) {
    return value;
  }

  const visibleStart = localPart.slice(0, 1);
  const hidden = "•".repeat(Math.max(localPart.length - 1, 4));
  return `${visibleStart}${hidden}@${domain}`;
}

function maskCpf(value: string | null) {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 11);

  if (digits.length !== 11) {
    return "•••.•••.•••-••";
  }

  return `•••.•••.${digits.slice(6, 9)}-••`;
}

function maskPhone(value: string | null) {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);

  if (digits.length < 10) {
    return "(••) •••••-••••";
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ••••-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) •••••-${digits.slice(7)}`;
}
