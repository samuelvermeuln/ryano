import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { auth } from "@/server/auth";
import { uploadUserAvatar } from "@/server/users/avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione uma imagem válida." }, { status: 400 });
    }

    const image = await uploadUserAvatar({
      userId: session.user.id,
      file,
    });

    revalidatePath("/app/perfil");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/integracoes");

    return NextResponse.json({ ok: true, image });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "UPLOAD_FAILED",
    }, { status: 400 });
  }
}
