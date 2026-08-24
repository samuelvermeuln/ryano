"use client";

import { useActionState } from "react";

import { saveProfileDetailsAction, type ActionState } from "@/app/actions/profile";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};

type ProfileDetailsFormProps = {
  user: {
    name: string | null;
    email: string;
    cpf: string | null;
    phone: string | null;
    heightCm: number | null;
    weightKg: string | null;
    postalCode: string | null;
    number: string | null;
    complement: string | null;
  };
};

export function ProfileDetailsForm({ user }: ProfileDetailsFormProps) {
  const [state, formAction] = useActionState(saveProfileDetailsAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {state.message ? (
        <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-foreground/76">
          {state.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" name="name" defaultValue={user.name ?? ""} />
        <ReadOnlyField label="E-mail" value={user.email} />
        <ReadOnlyField label="CPF" value={formatCpf(user.cpf ?? "")} helper="Bloqueado para evitar troca indevida. Correção só com admin." />
        <ReadOnlyField label="Telefone" value={formatPhone(user.phone ?? "")} helper="Bloqueado por segurança. Correção só com admin." />
        <Field label="Altura" name="heightCm" type="number" defaultValue={user.heightCm?.toString() ?? ""} suffix="cm" />
        <Field label="Peso" name="weightKg" type="number" step="0.1" defaultValue={user.weightKg ?? ""} suffix="kg" />
        <Field label="CEP" name="postalCode" defaultValue={formatPostalCode(user.postalCode ?? "")} placeholder="00000-000" />
        <Field label="Número" name="number" defaultValue={user.number ?? ""} />
        <div className="sm:col-span-2">
          <Field label="Complemento" name="complement" defaultValue={user.complement ?? ""} required={false} />
        </div>
      </div>

      <div className="rounded-[20px] border border-white/10 bg-black/10 px-4 py-4 text-sm leading-7 text-foreground/68">
        Ao salvar, CEP é usado para atualizar logradouro, bairro, cidade, UF e país automaticamente.
      </div>

      <SubmitButton className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Salvando perfil...">
        Salvar dados do perfil
      </SubmitButton>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  step,
  required = true,
  suffix,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  step?: string;
  required?: boolean;
  suffix?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input flex items-center gap-3 rounded-[20px] px-4 py-3">
        <input
          name={name}
          type={type}
          step={step}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
        />
        {suffix ? <span className="text-xs text-foreground/48">{suffix}</span> : null}
      </div>
    </label>
  );
}

function ReadOnlyField({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3">
        <input value={value || "—"} readOnly className="w-full bg-transparent text-sm text-foreground/68 outline-none" />
      </div>
      {helper ? <p className="text-xs text-foreground/50">{helper}</p> : null}
    </label>
  );
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
