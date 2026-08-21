"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { saveOnboardingAction, type ActionState } from "@/app/actions/profile";
import { SubmitButton } from "@/components/submit-button";
import { SectionCard } from "@/components/section-card";

const initialState: ActionState = {};
const orderedSteps = ["step-1", "step-2", "step-3"] as const;

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
  onStepChange: (stepId: (typeof orderedSteps)[number] | "step-4" | "step-5") => void;
};

export function OnboardingForm({ user, activeStepId, onStepChange }: OnboardingFormProps) {
  const [state, formAction] = useActionState(saveOnboardingAction, initialState);
  const router = useRouter();
  const currentIndex = orderedSteps.indexOf(activeStepId);
  const previousStep = currentIndex > 0 ? orderedSteps[currentIndex - 1] : null;
  const nextStep = currentIndex < orderedSteps.length - 1 ? orderedSteps[currentIndex + 1] : "step-4";

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.refresh();
    onStepChange(nextStep);
  }, [nextStep, onStepChange, router, state.success]);

  return (
    <SectionCard
      title={getStepTitle(activeStepId)}
      description={getStepDescription(activeStepId)}
      action={<span className="text-sm font-medium text-foreground/52">Etapa {currentIndex + 1} de 3</span>}
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
            {state.message}
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
            <Field label="CPF" name="cpf" defaultValue={user.cpf ?? ""} placeholder="000.000.000-00" />
            <Field label="Telefone" name="phone" defaultValue={user.profile?.phoneE164 ?? ""} placeholder="(27) 99999-9999" />
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
          </div>
        ) : null}

        {activeStepId === "step-3" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CEP" name="postalCode" defaultValue={user.address?.postalCode ?? ""} />
            <Field label="Logradouro" name="street" defaultValue={user.address?.street ?? ""} />
            <Field label="Número" name="number" defaultValue={user.address?.number ?? ""} />
            <Field label="Complemento" name="complement" defaultValue={user.address?.complement ?? ""} required={false} />
            <Field label="Bairro" name="district" defaultValue={user.address?.district ?? ""} />
            <Field label="Cidade" name="city" defaultValue={user.address?.city ?? ""} />
            <Field label="UF" name="state" defaultValue={user.address?.state ?? ""} />
            <Field label="País" name="country" defaultValue={user.address?.country ?? "Brasil"} />
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

  if (stepId === "step-2") {
    return "Complete seu perfil";
  }

  return "Seu endereço";
}

function getStepDescription(stepId: (typeof orderedSteps)[number]) {
  if (stepId === "step-1") {
    return "Confira seus dados básicos.";
  }

  if (stepId === "step-2") {
    return "Complete seus dados pessoais para continuar.";
  }

  return "Informe onde você mora.";
}

type FieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  step?: string;
  required?: boolean;
  suffix?: string;
};

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  step,
  required = true,
  suffix,
}: FieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input flex items-center gap-3 rounded-[18px] px-4 py-3">
        <input
          name={name}
          type={type}
          step={step}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
        />
        {suffix ? <span className="text-sm font-medium text-foreground/48">{suffix}</span> : null}
      </div>
    </label>
  );
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
