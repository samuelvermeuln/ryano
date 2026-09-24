import { z } from "zod";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { SchoolService } from "@/modules/school/application/school-service";
import { assertSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";

export const schools = new SchoolService(prisma);
export type SchoolRouteContext = { params: Promise<{ id: string }> };
const emptyBodySchema = z.strictObject({});

export async function schoolResponse(operation: (actorId: string) => Promise<unknown>, status = 200) {
  return publicSchoolResponse(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new SchoolError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
    return operation(session.user.id);
  }, status);
}

/** Feature-gated response envelope for explicitly public school operations. */
export async function publicSchoolResponse(operation: () => Promise<unknown>, status = 200) {
  try {
    assertSchoolModuleEnabled();
    return Response.json(await operation(), { status });
  } catch (error) {
    if (error instanceof SchoolError) {
      return Response.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return Response.json({
        code: "VALIDATION_ERROR", message: "Dados inválidos.",
        details: error.issues.map(({ code, path, message }) => ({ code, path, message })),
      }, { status: 400 });
    }
    if (error instanceof Error && error.message === "SCHOOL_MODULE_DISABLED") {
      return Response.json({ code: "SCHOOL_MODULE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
    }
    // TM016 — same envelope, same safe-404 convention, for the marketplace's
    // own flag (assertMarketplaceEnabled). Routes under app/api/marketplace,
    // app/api/coach/products, etc. reuse schoolResponse/publicSchoolResponse
    // and simply call assertMarketplaceEnabled() themselves (RNF-004/RNF-009).
    if (error instanceof Error && error.message === "MARKETPLACE_DISABLED") {
      return Response.json({ code: "MARKETPLACE_DISABLED", message: "Recurso indisponível." }, { status: 404 });
    }
    return Response.json({ code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." }, { status: 500 });
  }
}

export async function schoolBody(request: Request, empty = false): Promise<unknown> {
  const text = await request.text();
  let body: unknown;
  try {
    body = empty && text.length === 0 ? {} : JSON.parse(text);
  } catch {
    throw new SchoolError("VALIDATION_ERROR", "Informe um corpo JSON válido.", 400);
  }
  return empty ? emptyBodySchema.parse(body) : body;
}
