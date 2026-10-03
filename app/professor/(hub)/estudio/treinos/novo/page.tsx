/** SAM-58 — `/professor/estudio/treinos/novo`: create a catalog template (version 1). */
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";

import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { templateContentSchema } from "@/modules/school/domain/workout-template-content";
import { requireOnboardedSession } from "@/server/auth-guards";
import { environmentOptions, managedSchools, sportOptions } from "../catalog-data";
import { TemplateEditor } from "../template-editor";

export const dynamic = "force-dynamic";

export default async function NovoModeloPage() {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession({ next: "/professor/estudio/treinos/novo" });
  const sports = sportOptions();
  return (
    <div className={PAGE_CLASS}>
      <Link href="/professor/estudio/treinos" className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50 hover:text-foreground/80">
        <IconArrowLeft size={14} aria-hidden="true" /> Catálogo
      </Link>
      <PageHeader title="Novo modelo" description="Um modelo não é prescrição: ele só chega a um aluno quando você prescreve." />
      <TemplateEditor
        initial={{
          id: null, version: null,
          meta: { title: "", code: null, contentKind: "SESSION", sportType: sports.find((item) => item.value === "swim")?.value ?? sports[0]!.value, environment: null, sessionType: null, level: null, phase: null, tags: [], capabilities: [], folder: null, description: null, status: "ACTIVE" },
          content: templateContentSchema.parse({}),
        }}
        sports={sports}
        environments={environmentOptions()}
        schools={await managedSchools(session.user.id)}
      />
    </div>
  );
}
