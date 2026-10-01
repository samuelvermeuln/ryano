import { redirect } from "next/navigation";

/**
 * SAM-24 — a busca de escolas do atleta vive em `/app/escola` (contexto Atleta,
 * com perfil em modal e "Associar-se"). Esta rota administrativa só redireciona
 * para não quebrar links antigos.
 */
export default function BuscarEscolaPage() {
  redirect("/app/escola");
}
