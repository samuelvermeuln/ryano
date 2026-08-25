"use client";

import { useActionState, type FormEvent } from "react";

import { updateAdminUserIdentityAction, type AdminUserActionState } from "@/app/actions/admin-users";
import { SubmitButton } from "@/components/submit-button";

const initialState: AdminUserActionState = {};

export function AdminUserIdentityForm({
  userId,
  cpf,
  phone,
}: {
  userId: string;
  cpf: string | null;
  phone: string | null;
}) {
  const formAction = updateAdminUserIdentityAction.bind(null, userId);
  const [state, action] = useActionState(formAction, initialState);

  return (
    <form action={action} className="space-y-4">
      {state.message ? (
        <div className="theme-panel-neutral rounded-[20px] border px-4 py-3 text-sm">
          {state.message}
        </div>
      ) : null}

      <Field label="CPF" name="cpf" defaultValue={formatCpf(cpf ?? "")} placeholder="000.000.000-00" />
      <Field label="Telefone" name="phone" defaultValue={formatPhone(phone ?? "")} placeholder="(27) 99999-9999" />

      <div className="theme-panel-neutral rounded-[20px] border px-4 py-4 text-sm leading-7">
        Use esta área só para correção administrativa. Se telefone for alterado, confirmação do WhatsApp volta para pendente.
      </div>

      <SubmitButton className="glass-button-primary rounded-[20px] px-5 py-3 text-sm font-semibold" pendingLabel="Salvando correção...">
        Salvar CPF e telefone
      </SubmitButton>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground/76">{label}</span>
      <div className="glass-input rounded-[20px] px-4 py-3">
        <input
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required
          onInput={name === "cpf" ? applyCpfMask : applyPhoneMask}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
        />
      </div>
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

function applyCpfMask(event: FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatCpf(event.currentTarget.value);
}

function applyPhoneMask(event: FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatPhone(event.currentTarget.value);
}
