"use client";

import { useActionState } from "react";

import { saveOnboardingAction, type ActionState } from "@/app/actions/profile";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

type OnboardingFormProps = {
  user: {
    name: string | null;
    email: string;
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
};

export function OnboardingForm({ user }: OnboardingFormProps) {
  const [state, formAction] = useActionState(saveOnboardingAction, initialState);

  return (
    <form action={formAction} className="grid gap-6">
      {state.message ? (
        <div
          className={`rounded-[22px] px-4 py-3 text-sm ${
            state.success
              ? "border border-emerald-300/18 bg-emerald-300/8 text-emerald-100"
              : "border border-rose-300/18 bg-rose-300/8 text-rose-100"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <div id="step-1" className="grid gap-4 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/42">Etapa 1</p>
          <h3 className="mt-2 text-base font-semibold text-foreground">Conta</h3>
          <p className="mt-1 text-sm leading-6 text-foreground/62">Nome pode ser ajustado aqui. Email segue como referência da conta autenticada.</p>
        </div>
        <Field label="Nome completo" name="name" defaultValue={user.name ?? ""} />
        <ReadOnlyField label="Email" value={user.email} />
      </div>

      <div id="step-2" className="grid gap-4 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/42">Etapa 2</p>
          <h3 className="mt-2 text-base font-semibold text-foreground">Dados pessoais</h3>
          <p className="mt-1 text-sm leading-6 text-foreground/62">CPF fica protegido server-side. Telefone em E.164 é base para ativação do WhatsApp.</p>
        </div>
        <Field label="CPF" name="cpf" placeholder="000.000.000-00" />
        <Field label="Telefone" name="phone" defaultValue={user.profile?.phoneE164 ?? ""} />
        <Field label="Altura (cm)" name="heightCm" type="number" defaultValue={user.profile?.heightCm?.toString() ?? ""} />
        <Field label="Peso (kg)" name="weightKg" type="number" step="0.1" defaultValue={user.profile?.weightKg ?? ""} />
      </div>

      <div id="step-3" className="grid gap-4 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/42">Etapa 3</p>
          <h3 className="mt-2 text-base font-semibold text-foreground">Endereço</h3>
          <p className="mt-1 text-sm leading-6 text-foreground/62">Complete endereço para ativar perfil base da conta.</p>
        </div>
        <Field label="CEP" name="postalCode" defaultValue={user.address?.postalCode ?? ""} />
        <Field label="Logradouro" name="street" defaultValue={user.address?.street ?? ""} />
        <Field label="Número" name="number" defaultValue={user.address?.number ?? ""} />
        <Field label="Complemento" name="complement" defaultValue={user.address?.complement ?? ""} required={false} />
        <Field label="Bairro" name="district" defaultValue={user.address?.district ?? ""} />
        <Field label="Cidade" name="city" defaultValue={user.address?.city ?? ""} />
        <Field label="UF" name="state" defaultValue={user.address?.state ?? ""} />
        <Field label="País" name="country" defaultValue={user.address?.country ?? "Brasil"} />
      </div>

      <SubmitButton
        className="glass-button-primary mt-2 rounded-[20px] px-5 py-3 text-sm font-semibold"
        pendingLabel="Salvando onboarding..."
      >
        Salvar etapas 1 a 3
      </SubmitButton>
    </form>
  );
}

type FieldProps = {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  step?: string;
  required?: boolean;
};

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  step,
  required = true,
}: FieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input rounded-[20px] px-4 py-3">
        <input
          name={name}
          type={type}
          step={step}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
        />
      </div>
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input rounded-[20px] px-4 py-3">
        <input value={value} readOnly className="w-full bg-transparent text-sm text-foreground/70 outline-none" />
      </div>
    </label>
  );
}
