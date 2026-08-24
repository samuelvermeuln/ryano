"use client";

import { signOut } from "next-auth/react";
import { useActionState, useEffect, useState, type ChangeEventHandler, type FocusEvent, type FocusEventHandler, type FormEvent, type FormEventHandler, type HTMLAttributes } from "react";
import { useRouter } from "next/navigation";

import { saveOnboardingAction, type ActionState } from "@/app/actions/profile";
import { SectionCard } from "@/components/section-card";
import { SubmitButton } from "@/components/submit-button";
import { getHttpClient } from "@/lib/http-client";

const initialState: ActionState = {};
const orderedSteps = ["step-1", "step-2"] as const;

type OnboardingFormProps = {
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
  activeStepId: (typeof orderedSteps)[number];
  onStepChange: (stepId: (typeof orderedSteps)[number] | "step-3" | "step-4") => void;
};

type IdentityAvailabilityState = {
  checking: boolean;
  unavailable: boolean;
  cpfUnavailable: boolean;
  phoneUnavailable: boolean;
};

export function OnboardingForm({ user, activeStepId, onStepChange }: OnboardingFormProps) {
  const [state, formAction] = useActionState(saveOnboardingAction, initialState);
  const [postalCodeMessage, setPostalCodeMessage] = useState<string | null>(null);
  const [postalCodeLoading, setPostalCodeLoading] = useState(false);
  const [lastPostalCodeLookup, setLastPostalCodeLookup] = useState<string | null>(null);
  const [cpfValue, setCpfValue] = useState(formatCpf(user.cpf ?? ""));
  const [phoneValue, setPhoneValue] = useState(formatPhone(user.profile?.phoneE164 ?? ""));
  const [identityAvailability, setIdentityAvailability] = useState<IdentityAvailabilityState>({
    checking: false,
    unavailable: false,
    cpfUnavailable: false,
    phoneUnavailable: false,
  });
  const router = useRouter();
  const currentIndex = orderedSteps.indexOf(activeStepId);
  const previousStep = currentIndex > 0 ? orderedSteps[currentIndex - 1] : null;
  const nextStep = currentIndex < orderedSteps.length - 1 ? orderedSteps[currentIndex + 1] : "step-3";

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.refresh();
    onStepChange(nextStep);
  }, [nextStep, onStepChange, router, state.success]);

  useEffect(() => {
    if (activeStepId !== "step-2") {
      return;
    }

    const cpfDigits = cpfValue.replace(/\D/g, "");
    const phoneDigits = phoneValue.replace(/\D/g, "");
    const hasCompleteCpf = cpfDigits.length === 11;
    const hasCompletePhone = phoneDigits.length >= 10;

    if (!hasCompleteCpf && !hasCompletePhone) {
      setIdentityAvailability({
        checking: false,
        unavailable: false,
        cpfUnavailable: false,
        phoneUnavailable: false,
      });
      return;
    }

    const timeout = window.setTimeout(async () => {
      setIdentityAvailability((current) => ({ ...current, checking: true }));

      try {
        const response = await getHttpClient().request<{
          unavailable: boolean;
          cpfUnavailable: boolean;
          phoneUnavailable: boolean;
        }>({
          url: "/api/onboarding/identity-availability",
          params: {
            cpf: hasCompleteCpf ? cpfDigits : undefined,
            phone: hasCompletePhone ? phoneValue : undefined,
          },
        });

        const payload = response.data;

        if (response.status < 200 || response.status >= 300) {
          setIdentityAvailability({
            checking: false,
            unavailable: false,
            cpfUnavailable: false,
            phoneUnavailable: false,
          });
          return;
        }

        setIdentityAvailability({
          checking: false,
          unavailable: payload.unavailable,
          cpfUnavailable: payload.cpfUnavailable,
          phoneUnavailable: payload.phoneUnavailable,
        });
      } catch {
        setIdentityAvailability({
          checking: false,
          unavailable: false,
          cpfUnavailable: false,
          phoneUnavailable: false,
        });
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [activeStepId, cpfValue, phoneValue]);

  async function handlePostalCodeBlur(event: FocusEvent<HTMLInputElement>) {
    const postalCode = event.currentTarget.value.replace(/\D/g, "");

    if (postalCode.length !== 8 || lastPostalCodeLookup === postalCode) {
      return;
    }

    setPostalCodeLoading(true);
    setPostalCodeMessage(null);

    try {
      const response = await getHttpClient().request<{
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      }>({
        url: `https://viacep.com.br/ws/${postalCode}/json/`,
      });
      const payload = response.data;

      if (response.status < 200 || response.status >= 300 || payload.erro) {
        setPostalCodeMessage("CEP não encontrado.");
        return;
      }

      setLastPostalCodeLookup(postalCode);
      setPostalCodeMessage(`Endereço encontrado: ${payload.logradouro ?? "logradouro"}, ${payload.localidade ?? "cidade"}/${payload.uf ?? "UF"}.`);
    } catch {
      setPostalCodeMessage("Não foi possível buscar este CEP agora.");
    } finally {
      setPostalCodeLoading(false);
    }
  }

  return (
    <SectionCard
      title={getStepTitle(activeStepId)}
      description={getStepDescription(activeStepId)}
      action={<span className="text-sm font-medium text-foreground/52">Etapa {currentIndex + 1} de {orderedSteps.length}</span>}
    >
      <form action={formAction} className="grid gap-5">
        <input type="hidden" name="stepId" value={activeStepId} />

        {state.message ? (
          <div
            className={`rounded-[20px] px-4 py-3 text-sm ${
              state.success
                ? "border border-emerald-300/18 bg-emerald-300/8 text-emerald-100"
                : "border border-rose-300/18 bg-rose-300/8 text-rose-100"
            }`}
          >
            <p>{state.message}</p>
            {state.code === "EXISTING_ACCOUNT_DATA" ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/entrar?motivo=conta-existente" })}
                  className="inline-flex items-center justify-center rounded-[16px] border border-current/20 px-4 py-2 text-xs font-semibold hover:bg-white/8"
                >
                  Entrar com conta existente
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeStepId === "step-1" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" name="name" defaultValue={user.name ?? ""} />
            <ReadOnlyField label="E-mail da sua conta" value={user.email} />
          </div>
        ) : null}

        {activeStepId === "step-2" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="CPF"
              name="cpf"
              value={cpfValue}
              placeholder="000.000.000-00"
              inputMode="numeric"
              maxLength={14}
              onInput={applyCpfMask}
              onChangeValue={setCpfValue}
            />
            <Field
              label="Telefone"
              name="phone"
              value={phoneValue}
              placeholder="(27) 99999-9999"
              inputMode="tel"
              maxLength={16}
              onInput={applyPhoneMask}
              onChangeValue={setPhoneValue}
            />
            {identityAvailability.unavailable ? (
              <div className="sm:col-span-2 rounded-[20px] border border-amber-300/18 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
                <p>
                  {identityAvailability.cpfUnavailable && identityAvailability.phoneUnavailable
                    ? "CPF e telefone já estão vinculados a uma conta existente. Entre com a conta correta para continuar."
                    : identityAvailability.cpfUnavailable
                      ? "Este CPF já está vinculado a uma conta existente. Entre com a conta correta para continuar."
                      : "Este telefone já está vinculado a uma conta existente. Entre com a conta correta para continuar."}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/entrar?motivo=conta-existente" })}
                    className="inline-flex items-center justify-center rounded-[16px] border border-current/20 px-4 py-2 text-xs font-semibold hover:bg-white/8"
                  >
                    Entrar com conta existente
                  </button>
                </div>
              </div>
            ) : null}
            {identityAvailability.checking ? <p className="sm:col-span-2 text-xs text-foreground/55">Verificando CPF e telefone...</p> : null}
            <Field
              label="Altura"
              name="heightCm"
              type="number"
              defaultValue={user.profile?.heightCm?.toString() ?? ""}
              suffix="cm"
            />
            <Field
              label="Peso"
              name="weightKg"
              type="number"
              step="0.1"
              defaultValue={user.profile?.weightKg ?? ""}
              suffix="kg"
            />
            <div className="space-y-2 sm:col-span-2">
              <Field
                label="CEP"
                name="postalCode"
                defaultValue={formatPostalCode(user.address?.postalCode ?? "")}
                placeholder="00000-000"
                inputMode="numeric"
                maxLength={9}
                onInput={applyPostalCodeMask}
                onBlur={handlePostalCodeBlur}
              />
              <p className="text-xs text-foreground/55">Com seu CEP, preencheremos o restante do endereço automaticamente.</p>
              {postalCodeLoading ? <p className="text-xs text-foreground/55">Buscando endereço...</p> : null}
              {postalCodeMessage ? <p className="text-xs text-foreground/55">{postalCodeMessage}</p> : null}
            </div>
            <Field label="Número" name="number" defaultValue={user.address?.number ?? ""} />
            <Field label="Complemento (opcional)" name="complement" defaultValue={user.address?.complement ?? ""} required={false} />
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          {previousStep ? (
            <button
              type="button"
              onClick={() => onStepChange(previousStep)}
              className="glass-button rounded-[18px] px-5 py-3 text-sm font-semibold text-foreground"
            >
              Voltar
            </button>
          ) : (
            <span />
          )}

          <SubmitButton
            className="glass-button-primary rounded-[18px] px-5 py-3 text-sm font-semibold"
            pendingLabel="Salvando..."
            disabled={activeStepId === "step-2" && identityAvailability.unavailable}
          >
            Salvar e continuar
          </SubmitButton>
        </div>
      </form>
    </SectionCard>
  );
}

function getStepTitle(stepId: (typeof orderedSteps)[number]) {
  if (stepId === "step-1") {
    return "Confira seus dados básicos";
  }

  return "Complete seu perfil";
}

function getStepDescription(stepId: (typeof orderedSteps)[number]) {
  if (stepId === "step-1") {
    return "Confira seus dados básicos.";
  }

  return "Informe seus dados pessoais e seu CEP para preencher o endereço automaticamente.";
}

type FieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  type?: string;
  step?: string;
  required?: boolean;
  suffix?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  onInput?: FormEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onChangeValue?: (value: string) => void;
};

function Field({
  label,
  name,
  defaultValue,
  value,
  placeholder,
  type = "text",
  step,
  required = true,
  suffix,
  inputMode,
  maxLength,
  onInput,
  onBlur,
  onChangeValue,
}: FieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input flex items-center gap-3 rounded-[18px] px-4 py-3">
        <input
          name={name}
          type={type}
          step={step}
          defaultValue={value === undefined ? defaultValue : undefined}
          value={value}
          placeholder={placeholder}
          required={required}
          inputMode={inputMode}
          maxLength={maxLength}
          onInput={onInput}
          onBlur={onBlur}
          onChange={onChangeValue ? ((event) => onChangeValue(event.target.value)) as ChangeEventHandler<HTMLInputElement> : undefined}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
        />
        {suffix ? <span className="text-sm font-medium text-foreground/48">{suffix}</span> : null}
      </div>
    </label>
  );
}

function applyCpfMask(event: FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatCpf(event.currentTarget.value);
}

function applyPhoneMask(event: FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatPhone(event.currentTarget.value);
}

function applyPostalCodeMask(event: FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatPostalCode(event.currentTarget.value);
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }

  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);

  if (digits.length <= 2) {
    return digits ? `(${digits}` : "";
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input rounded-[18px] px-4 py-3">
        <input value={value} readOnly className="w-full bg-transparent text-sm text-foreground/70 outline-none" />
      </div>
    </label>
  );
}
