import { permanentRedirect } from "next/navigation";

/** SAM-12 — rota legada: a gestão de produtos do professor vive em `/professor/estudio/produtos`. */
export default function LegacyPlanosPage() {
  permanentRedirect("/professor/estudio/produtos");
}
