"use client";

import { useActionState, useState, useTransition } from "react";
import { createSchoolAction, lookupCepAction } from "./actions";
import type { CreateSchoolState } from "./actions";

// ──────────────────────────────────────────────────────────────────────────────
// Sport types available for selection
// ──────────────────────────────────────────────────────────────────────────────

const SPORT_OPTIONS: { value: string; label: string }[] = [
  { value: "swim",            label: "Natação" },
  { value: "open-water",      label: "Natação em Águas Abertas" },
  { value: "bike",            label: "Ciclismo" },
  { value: "mtb",             label: "Mountain Bike" },
  { value: "run",             label: "Corrida" },
  { value: "trail-run",       label: "Trail Run" },
  { value: "triathlon",       label: "Triathlon" },
  { value: "duathlon",        label: "Duathlon" },
  { value: "aquathlon",       label: "Aquathlon" },
  { value: "walking",         label: "Caminhada" },
  { value: "hiking",          label: "Trilha / Hiking" },
  { value: "gym",             label: "Academia / Musculação" },
  { value: "crossfit",        label: "CrossFit" },
  { value: "football",        label: "Futebol" },
  { value: "futsal",          label: "Futsal" },
  { value: "basketball",      label: "Basquete" },
  { value: "volleyball",      label: "Vôlei" },
  { value: "tennis",          label: "Tênis" },
  { value: "padel",           label: "Padel" },
  { value: "surf",            label: "Surf" },
  { value: "rowing",          label: "Remo" },
  { value: "kayak",           label: "Caiaque" },
  { value: "stand-up-paddle", label: "Stand-Up Paddle" },
  { value: "dance",           label: "Dança" },
  { value: "rock-climbing",   label: "Escalada" },
  { value: "inline-skate",    label: "Patins" },
  { value: "skateboard",      label: "Skate" },
  { value: "alpine-ski",      label: "Ski Alpino" },
  { value: "snowboard",       label: "Snowboard" },
];

// ──────────────────────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────────────────────

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-destructive mt-1">{error}</p>;
}

function Field({
  id, label, required, hint, error, children,
}: {
  id: string; label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError error={error} />
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const inputErrCls = "w-full rounded-lg border border-destructive bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-destructive";

function Input({ name, type = "text", placeholder, required, maxLength, value, onChange, error, autoComplete }: {
  name: string; type?: string; placeholder?: string; required?: boolean; maxLength?: number;
  value?: string; onChange?: (v: string) => void; error?: string; autoComplete?: string;
}) {
  return (
    <input
      id={name} name={name} type={type} placeholder={placeholder} required={required}
      maxLength={maxLength} value={value} autoComplete={autoComplete}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className={error ? inputErrCls : inputCls}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Step indicators
// ──────────────────────────────────────────────────────────────────────────────

const STEPS = ["Escola", "Endereço", "Modalidades", "Professores"];

function StepBar({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors
                ${done ? "bg-primary border-primary text-primary-foreground"
                  : active ? "border-primary text-primary bg-background"
                  : "border-border text-muted-foreground bg-background"}`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-xs mt-1 ${active ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-4 rounded ${done ? "bg-primary" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main wizard
// ──────────────────────────────────────────────────────────────────────────────

export function CreateSchoolForm() {
  const [state, action, isSubmitting] = useActionState(createSchoolAction, {});
  const [step, setStep] = useState(0);
  const [, startLookup] = useTransition();

  // Step 1 — Dados da escola
  const [schoolName, setSchoolName]     = useState("");
  const [schoolEmail, setSchoolEmail]   = useState("");
  const [schoolPhone, setSchoolPhone]   = useState("");
  const [cnpj, setCnpj]                 = useState("");
  const [description, setDescription]  = useState("");
  const [joinPolicy, setJoinPolicy]     = useState("REQUIRE_APPROVAL");

  // Step 2 — Endereço
  const [postalCode, setPostalCode]         = useState("");
  const [addressNumber, setAddressNumber]   = useState("");
  const [complement, setComplement]         = useState("");
  const [street, setStreet]                 = useState("");
  const [district, setDistrict]             = useState("");
  const [city, setCity]                     = useState("");
  const [addressState, setAddressState]     = useState("");
  const [cepError, setCepError]             = useState("");
  const [cepLoading, setCepLoading]         = useState(false);

  // Step 3 — Modalidades
  const [selectedSports, setSelectedSports] = useState<Set<string>>(new Set());

  // Step 4 — Professores
  const [coachEmails, setCoachEmails] = useState("");

  const fe = state.fieldErrors ?? {};

  function handleCepBlur(raw: string) {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepLoading(true);
    setCepError("");
    startLookup(async () => {
      const result = await lookupCepAction(cep);
      setCepLoading(false);
      if (!result.ok) { setCepError(result.message); return; }
      setStreet(result.street);
      setDistrict(result.district);
      setCity(result.city);
      setAddressState(result.state);
    });
  }

  function toggleSport(value: string) {
    setSelectedSports((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!schoolName.trim()) return "Informe o nome da escola.";
      if (!schoolEmail.trim()) return "Informe o e-mail da escola.";
      if (!schoolPhone.trim()) return "Informe o telefone da escola.";
      if (cnpj.replace(/\D/g, "").length !== 14) return "CNPJ inválido. Informe 14 dígitos.";
    }
    if (step === 1) {
      if (postalCode.replace(/\D/g, "").length !== 8) return "Informe um CEP válido.";
      if (!addressNumber.trim()) return "Informe o número.";
      if (!street) return "Preencha o CEP para carregar o endereço.";
    }
    if (step === 2) {
      if (selectedSports.size === 0) return "Selecione ao menos uma modalidade.";
    }
    return null;
  }

  function handleNext() {
    const err = validateStep();
    if (err) { alert(err); return; }
    setStep((s) => s + 1);
  }

  // Hidden fields assembled from state for the final submit
  const hiddenFields = (
    <>
      <input type="hidden" name="schoolName"    value={schoolName} />
      <input type="hidden" name="schoolEmail"   value={schoolEmail} />
      <input type="hidden" name="schoolPhone"   value={schoolPhone} />
      <input type="hidden" name="cnpj"          value={cnpj} />
      <input type="hidden" name="description"   value={description} />
      <input type="hidden" name="joinPolicy"    value={joinPolicy} />
      <input type="hidden" name="postalCode"    value={postalCode} />
      <input type="hidden" name="addressNumber" value={addressNumber} />
      <input type="hidden" name="complement"    value={complement} />
      <input type="hidden" name="sportTypes"    value={[...selectedSports].join(",")} />
      <input type="hidden" name="coachEmails"   value={coachEmails} />
    </>
  );

  return (
    <div>
      <StepBar current={step} />

      {state.message && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
          {state.message}
        </div>
      )}

      {/* ── Step 0: Dados da escola ─────────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-5">
          <Field id="schoolName" label="Nome da escola" required error={fe.schoolName}>
            <Input name="schoolName" placeholder="Ex: Academia Ryvano" required maxLength={200}
              value={schoolName} onChange={setSchoolName} error={fe.schoolName} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="schoolEmail" label="E-mail da escola" required error={fe.schoolEmail}>
              <Input name="schoolEmail" type="email" placeholder="contato@escola.com.br" required
                value={schoolEmail} onChange={setSchoolEmail} error={fe.schoolEmail} />
            </Field>
            <Field id="schoolPhone" label="Telefone" required error={fe.schoolPhone}>
              <Input name="schoolPhone" type="tel" placeholder="(11) 99999-9999" required
                value={schoolPhone} onChange={setSchoolPhone} error={fe.schoolPhone} autoComplete="tel" />
            </Field>
          </div>

          <Field id="cnpj" label="CNPJ" required error={fe.cnpj}
            hint="Somente números ou no formato 00.000.000/0001-00">
            <Input name="cnpj" placeholder="00.000.000/0001-00" required maxLength={18}
              value={cnpj} onChange={setCnpj} error={fe.cnpj} />
          </Field>

          <Field id="description" label="Descrição" hint="Opcional — aparece na busca pública da escola.">
            <textarea id="description" name="description" rows={3} maxLength={5000}
              placeholder="Metodologia, história, diferenciais…"
              value={description} onChange={(e) => setDescription(e.target.value)}
              className={`${inputCls} resize-none`} />
          </Field>

          <Field id="joinPolicy" label="Política de entrada"
            hint="Você pode alterar depois nas configurações da escola.">
            <select id="joinPolicy" name="joinPolicy" value={joinPolicy}
              onChange={(e) => setJoinPolicy(e.target.value)} className={inputCls}>
              <option value="REQUIRE_APPROVAL">Somente com aprovação do responsável</option>
              <option value="AUTO_APPROVE">Entrada automática</option>
              <option value="INVITE_ONLY">Somente por convite</option>
            </select>
          </Field>

          <button type="button" onClick={handleNext}
            className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
            Próximo →
          </button>
        </div>
      )}

      {/* ── Step 1: Endereço ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field id="postalCode" label="CEP" required error={cepError || fe.postalCode}>
                <input id="postalCode" name="postalCode" type="text" placeholder="00000-000" required maxLength={9}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  onBlur={(e) => handleCepBlur(e.target.value)}
                  className={cepError || fe.postalCode ? inputErrCls : inputCls} />
              </Field>
            </div>
            <Field id="addressNumber" label="Número" required error={fe.addressNumber}>
              <Input name="addressNumber" placeholder="123" required maxLength={20}
                value={addressNumber} onChange={setAddressNumber} error={fe.addressNumber} />
            </Field>
          </div>

          {cepLoading && <p className="text-xs text-muted-foreground">Buscando CEP…</p>}

          {street && (
            <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 text-sm space-y-0.5">
              <p className="font-medium">{street}</p>
              <p className="text-muted-foreground">{district && `${district} · `}{city} — {addressState}</p>
            </div>
          )}

          <Field id="complement" label="Complemento" hint="Opcional — sala, bloco, andar…">
            <Input name="complement" placeholder="Sala 2, Bloco B" maxLength={100}
              value={complement} onChange={setComplement} />
          </Field>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(0)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              ← Voltar
            </button>
            <button type="button" onClick={handleNext}
              className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
              Próximo →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Modalidades ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium mb-1">
              Modalidades <span className="text-destructive">*</span>
            </p>
            <p className="text-xs text-muted-foreground mb-3">Selecione todas as modalidades atendidas pela escola.</p>
            {fe.sportTypes && <FieldError error={fe.sportTypes} />}
            <div className="grid grid-cols-2 gap-2">
              {SPORT_OPTIONS.map(({ value, label }) => {
                const checked = selectedSports.has(value);
                return (
                  <button key={value} type="button" onClick={() => toggleSport(value)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors
                      ${checked ? "border-primary bg-primary/10 text-primary font-medium"
                                : "border-border bg-background hover:bg-muted"}`}>
                    <span className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center
                      ${checked ? "bg-primary border-primary" : "border-border"}`}>
                      {checked && <span className="text-primary-foreground text-xs leading-none">✓</span>}
                    </span>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              ← Voltar
            </button>
            <button type="button" onClick={handleNext}
              className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
              Próximo →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Professores (submit) ─────────────────────────────────────── */}
      {step === 3 && (
        <form action={action} className="space-y-5">
          {hiddenFields}

          <div>
            <p className="text-sm font-medium mb-1">Convidar professores</p>
            <p className="text-xs text-muted-foreground mb-3">
              Opcional — cada professor receberá um link de convite por e-mail.
              Você também pode convidar depois pelo painel da escola.
            </p>
            <textarea
              name="coachEmails" rows={4} maxLength={2000}
              placeholder={"professor@email.com\noutro@email.com"}
              value={coachEmails} onChange={(e) => setCoachEmails(e.target.value)}
              className={`${inputCls} resize-none font-mono text-xs`} />
            {fe.coachEmails && <FieldError error={fe.coachEmails} />}
            <p className="text-xs text-muted-foreground mt-1">Um e-mail por linha ou separados por vírgula.</p>
          </div>

          {/* Resumo antes de confirmar */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm space-y-1">
            <p className="font-semibold text-base mb-2">Resumo do cadastro</p>
            <p><span className="text-muted-foreground">Escola:</span> {schoolName}</p>
            <p><span className="text-muted-foreground">E-mail:</span> {schoolEmail}</p>
            <p><span className="text-muted-foreground">CNPJ:</span> {cnpj}</p>
            <p><span className="text-muted-foreground">Endereço:</span> {street}, {addressNumber}{complement ? ` — ${complement}` : ""} · {city}/{addressState}</p>
            <p><span className="text-muted-foreground">Modalidades:</span>{" "}
              {[...selectedSports].map((s) => SPORT_OPTIONS.find((o) => o.value === s)?.label ?? s).join(", ")}
            </p>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(2)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
              ← Voltar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
              {isSubmitting ? "Criando escola…" : "Criar escola"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
