import { redirect } from "next/navigation";

import { buildNoIndexMetadata } from "@/server/seo";
import { redirectIfAuthenticated } from "@/server/auth-guards";

export const metadata = buildNoIndexMetadata({
  title: "Cadastro",
  description: "Página de criação de conta da ryvano.",
  path: "/cadastro",
});

export default async function SignupPage() {
  await redirectIfAuthenticated();
  redirect("/entrar?modo=cadastro");
}
