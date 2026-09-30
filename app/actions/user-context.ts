"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { listUserContexts } from "@/server/user-context";
import {
  CONTEXT_PICKER_ROUTE,
  USER_CONTEXT_COOKIE,
  contextLandingRoute,
  findContext,
  parseContextPreference,
  serializeContextPreference,
} from "@/lib/user-context";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Grava a preferência de contexto (contexto + escopo opcional do professor).
 * Só grava chaves cujo contexto pertence ao usuário autenticado — devolve
 * `false` caso contrário, sem lançar, porque o chamador de sincronização
 * (`ActiveContextSync`) roda em background.
 *
 * O escopo `professor:<schoolId>` é lembrado tal como veio: é preferência de
 * navegação, revalidada na leitura (`resolveRememberedProfessorScope`), e o
 * layout de `/professor/<id>` continua sendo quem autoriza o acesso à escola.
 */
async function persistContextPreference(raw: string): Promise<boolean> {
  const session = await requireOnboardedSession();
  const preference = parseContextPreference(raw);
  if (!preference) return false;

  const contexts = await listUserContexts(session.user.id);
  if (!findContext(contexts, preference.key)) return false;

  const store = await cookies();
  store.set({
    name: USER_CONTEXT_COOKIE,
    value: serializeContextPreference(preference),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return true;
}

/**
 * Lembra o contexto implicado pela rota atual (ex.: entrar em `/escola/<id>`
 * torna a escola o contexto ativo para as páginas compartilhadas seguintes).
 * Cookies só podem ser gravados em Server Function/Route Handler, por isso o
 * layout delega a um client component que chama esta action.
 */
export async function rememberActiveContextAction(raw: string): Promise<void> {
  await persistContextPreference(raw);
}

/**
 * Troca explícita de contexto (header/seletor): valida, persiste e leva para a
 * landing do contexto escolhido. Não exige novo login.
 */
export async function switchContextAction(formData: FormData): Promise<void> {
  const raw = String(formData.get("contextKey") ?? "");
  const session = await requireOnboardedSession();
  const preference = parseContextPreference(raw);
  const context = preference ? findContext(await listUserContexts(session.user.id), preference.key) : null;

  if (!context) {
    redirect(CONTEXT_PICKER_ROUTE);
  }

  await persistContextPreference(context.key);
  redirect(contextLandingRoute(context));
}
