"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { requestPasswordResetAction, resetPasswordAction, type ActionState } from "@/app/actions/auth";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/submit-button";

const initialState: ActionState = {};
const CODE_LENGTH = 6;

type ResetPasswordFormProps = {
  token?: string;
  identifier?: string;
  codeExpiresAt?: string;
  prefilledCode?: string;
};

export function ResetPasswordForm({ token, identifier = "", codeExpiresAt, prefilledCode = "" }: ResetPasswordFormProps) {
  const sanitizedPrefilledCode = prefilledCode.replace(/\D/g, "").slice(0, CODE_LENGTH);
  const [typedIdentifier, setTypedIdentifier] = useState(identifier);
  const [digits, setDigits] = useState<string[]>(Array.from({ length: CODE_LENGTH }, () => ""));
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [showManualCodeInput, setShowManualCodeInput] = useState(!sanitizedPrefilledCode);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [state, formAction] = useActionState(resetPasswordAction, initialState);
  const [resendState, resendAction] = useActionState(requestPasswordResetAction, initialState);

  const recoveryIdentifier = state.recoveryIdentifier ?? resendState.recoveryIdentifier ?? typedIdentifier;
  const activeExpiresAt = resendState.resetCodeExpiresAt ?? codeExpiresAt ?? null;
  const typedCode = useMemo(() => digits.join(""), [digits]);

  useEffect(() => {
    if (!activeExpiresAt) {
      setRemainingSeconds(null);
      return;
    }

    const updateRemainingSeconds = () => {
      const expiresAt = new Date(activeExpiresAt).getTime();
      const nextValue = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(nextValue);
    };

    updateRemainingSeconds();
    const interval = window.setInterval(updateRemainingSeconds, 1000);

    return () => window.clearInterval(interval);
  }, [activeExpiresAt]);

  useEffect(() => {
    if (!recoveryIdentifier) {
      return;
    }

    setTypedIdentifier(recoveryIdentifier);
  }, [recoveryIdentifier]);

  useEffect(() => {
    if (!sanitizedPrefilledCode) {
      return;
    }

    const nextDigits = Array.from({ length: CODE_LENGTH }, (_, index) => sanitizedPrefilledCode[index] ?? "");
    setDigits(nextDigits);
  }, [sanitizedPrefilledCode]);

  useEffect(() => {
    if (resendState.code !== "PASSWORD_RESET_CODE_SENT") {
      return;
    }

    setShowManualCodeInput(true);
    setDigits(Array.from({ length: CODE_LENGTH }, () => ""));
    inputRefs.current[0]?.focus();
  }, [resendState.code]);

  if (token) {
    return (
      <form action={formAction} className="space-y-4">
        {state.message ? (
          <div className="rounded-[22px] border border-rose-300/18 bg-rose-300/8 px-4 py-3 text-sm text-rose-100">
            {state.message}
          </div>
        ) : null}

        <input type="hidden" name="token" value={token} />

        <PasswordField
          name="password"
          label="Nova senha"
          placeholder="Crie uma nova senha"
          autoComplete="new-password"
          required
          helperText="Use pelo menos 8 caracteres."
        />

        <SubmitButton className="glass-button-primary h-[52px] w-full rounded-2xl px-5 py-3 text-sm font-semibold" pendingLabel="Salvando...">
          Redefinir senha
        </SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-foreground/76">
          <p className="font-medium text-foreground">Como criar nova senha</p>
          <ol className="mt-2 space-y-1 text-foreground/72">
            <li>1. Digite o mesmo e-mail ou telefone usado antes.</li>
            <li>2. Use o código que chegou no e-mail.</li>
            <li>3. Crie sua nova senha e confirme.</li>
          </ol>
          {remainingSeconds !== null ? (
            <p className="mt-2 text-sm font-medium text-foreground">Código válido por {formatRemainingTime(remainingSeconds)}.</p>
          ) : (
            <p className="mt-2 text-xs text-foreground/55">Cada código vale por 15 minutos.</p>
          )}
        </div>

        {state.message ? (
          <div className="rounded-[22px] border border-rose-300/18 bg-rose-300/8 px-4 py-3 text-sm text-rose-100">
            <p>{state.message}</p>
          </div>
        ) : null}

        {resendState.message ? (
          <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-foreground/76">
            <p>{resendState.message}</p>
            {remainingSeconds !== null ? (
              <p className="mt-2 text-sm font-medium text-foreground">Novo código válido por {formatRemainingTime(remainingSeconds)}.</p>
            ) : null}
            {resendState.resetCode ? (
              <div className="mt-3 rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 text-center">
                <p className="text-xs uppercase tracking-[0.18em] text-foreground/50">Código local de teste</p>
                <p className="mt-2 text-3xl font-semibold tracking-[0.3em] text-foreground">{resendState.resetCode}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="block space-y-2">
          <span className="text-[13px] font-medium text-foreground/76 sm:text-sm">E-mail ou telefone</span>
          <div className="glass-input rounded-2xl px-4 py-3">
            <input
              name="identifier"
              type="text"
              autoComplete="username"
              inputMode="text"
              placeholder="seu@email.com ou (27) 99999-9999"
              value={typedIdentifier}
              onChange={(event) => setTypedIdentifier(event.target.value)}
              className="w-full bg-transparent text-[16px] text-foreground outline-none placeholder:text-foreground/40 sm:text-sm"
              required
            />
          </div>
        </label>

        <input type="hidden" name="code" value={typedCode} />

        {sanitizedPrefilledCode && !showManualCodeInput ? (
          <div className="rounded-[22px] border border-emerald-300/18 bg-emerald-300/8 px-4 py-4 text-sm text-emerald-100">
            <p className="font-medium">Código deste e-mail já foi aplicado.</p>
            <p className="mt-1 text-emerald-100/85">Agora crie sua nova senha. Se preferir, você também pode digitar outro código manualmente.</p>
            <button
              type="button"
              onClick={() => {
                setShowManualCodeInput(true);
                inputRefs.current[0]?.focus();
              }}
              className="mt-3 inline-flex rounded-[16px] border border-current/20 px-4 py-2 text-xs font-semibold hover:bg-white/8"
            >
              Digitar código manualmente
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="block text-[13px] font-medium text-foreground/76 sm:text-sm">Código de 6 números</span>
              {sanitizedPrefilledCode ? (
                <button
                  type="button"
                  onClick={() => setShowManualCodeInput(false)}
                  className="text-xs font-medium text-foreground/60 hover:text-foreground"
                >
                  Usar código deste e-mail
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-6 gap-2 sm:gap-3">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    inputRefs.current[index] = element;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  placeholder="0"
                  value={digit}
                  onChange={(event) => handleDigitChange(index, event.target.value, digits, setDigits, inputRefs.current)}
                  onKeyDown={(event) => handleDigitKeyDown(index, event, digits, setDigits, inputRefs.current)}
                  onPaste={(event) => handleDigitPaste(event, digits, setDigits, inputRefs.current)}
                  onFocus={(event) => event.currentTarget.select()}
                  className="glass-input h-14 rounded-2xl px-0 text-center text-xl font-semibold tracking-[0.2em] text-foreground outline-none placeholder:text-foreground/30"
                  maxLength={6}
                  aria-label={`Dígito ${index + 1} do código`}
                  required
                />
              ))}
            </div>
            <p className="text-xs text-foreground/55">Abra seu e-mail, copie o código e digite os 6 números aqui.</p>
          </div>
        )}

        <PasswordField
          name="password"
          label="Nova senha"
          placeholder="Crie uma nova senha"
          autoComplete="new-password"
          required
          autoFocus={Boolean(sanitizedPrefilledCode) && !showManualCodeInput}
          helperText="Use pelo menos 8 caracteres, com letra e número."
        />

        <PasswordField
          name="passwordConfirmation"
          label="Confirme a nova senha"
          placeholder="Digite a senha novamente"
          autoComplete="new-password"
          required
        />

        <SubmitButton className="glass-button-primary h-[52px] w-full rounded-2xl px-5 py-3 text-sm font-semibold" pendingLabel="Salvando...">
          Criar nova senha
        </SubmitButton>
      </form>

      {recoveryIdentifier ? (
        <form action={resendAction} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
          <input type="hidden" name="identifier" value={recoveryIdentifier} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm leading-6 text-foreground/72">
              <p className="font-medium text-foreground">Não recebeu o código?</p>
              <p>Toque no botão abaixo para pedir outro código.</p>
            </div>
            <SubmitButton className="glass-button rounded-2xl px-5 py-3 text-sm font-semibold text-foreground" pendingLabel="Enviando novo código...">
              Reenviar código
            </SubmitButton>
          </div>
        </form>
      ) : (
        <Link
          href="/recuperar-senha"
          className="inline-flex items-center justify-center rounded-[16px] border border-white/10 px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/8"
        >
          Voltar para pedir código
        </Link>
      )}
    </div>
  );
}

function handleDigitChange(
  index: number,
  value: string,
  digits: string[],
  setDigits: (digits: string[]) => void,
  inputRefs: Array<HTMLInputElement | null>,
) {
  const numbers = value.replace(/\D/g, "");

  if (!numbers) {
    const nextDigits = [...digits];
    nextDigits[index] = "";
    setDigits(nextDigits);
    return;
  }

  const nextDigits = [...digits];

  for (let offset = 0; offset < numbers.length && index + offset < CODE_LENGTH; offset += 1) {
    nextDigits[index + offset] = numbers[offset] ?? "";
  }

  setDigits(nextDigits);

  const nextIndex = Math.min(index + numbers.length, CODE_LENGTH - 1);
  inputRefs[nextIndex]?.focus();
}

function handleDigitKeyDown(
  index: number,
  event: KeyboardEvent<HTMLInputElement>,
  digits: string[],
  setDigits: (digits: string[]) => void,
  inputRefs: Array<HTMLInputElement | null>,
) {
  if (event.key !== "Backspace") {
    return;
  }

  if (digits[index]) {
    const nextDigits = [...digits];
    nextDigits[index] = "";
    setDigits(nextDigits);
    return;
  }

  if (index === 0) {
    return;
  }

  const nextDigits = [...digits];
  nextDigits[index - 1] = "";
  setDigits(nextDigits);
  inputRefs[index - 1]?.focus();
}

function handleDigitPaste(
  event: ClipboardEvent<HTMLInputElement>,
  digits: string[],
  setDigits: (digits: string[]) => void,
  inputRefs: Array<HTMLInputElement | null>,
) {
  const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);

  if (!pasted) {
    return;
  }

  event.preventDefault();
  const nextDigits = [...digits];

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    nextDigits[index] = pasted[index] ?? "";
  }

  setDigits(nextDigits);
  inputRefs[Math.min(pasted.length, CODE_LENGTH) - 1]?.focus();
}

function formatRemainingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
