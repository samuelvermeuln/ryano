import { permanentRedirect } from "next/navigation";

/** SAM-12 — rota legada: o cadastro é `/professor/estudio/produtos/novo`. */
export default function LegacyNovoPlanoPage() {
  permanentRedirect("/professor/estudio/produtos/novo");
}
