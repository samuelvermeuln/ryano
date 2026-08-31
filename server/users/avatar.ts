import { prisma } from "@/server/db";

import sharp from "sharp";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_REMOTE_BYTES = 8 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const GOOGLE_AVATAR_HOST_SUFFIXES = ["googleusercontent.com", "ggpht.com"];

/**
 * Armazenamento de avatar: os avatares são normalizados (redimensionados +
 * recodificados) e gravados como data URI base64 direto em `User.image`,
 * sem nenhum arquivo físico em disco. `User.avatarSource` registra a
 * proveniência (`CUSTOM` = upload manual, `GOOGLE` = sincronizado do login
 * Google) para que um novo login Google nunca sobrescreva silenciosamente
 * uma foto enviada manualmente — antes essa distinção vinha do prefixo do
 * caminho do arquivo (`/uploads/avatars/custom/...` vs `.../google/...`).
 */
export async function uploadUserAvatar(input: { userId: string; file: File }) {
  validateUploadFile(input.file);

  const sourceBuffer = Buffer.from(await input.file.arrayBuffer());
  const dataUri = await normalizeAvatarToDataUri(sourceBuffer, "webp");

  await prisma.user.update({
    where: { id: input.userId },
    data: { image: dataUri, avatarSource: "CUSTOM" },
  });

  return dataUri;
}

export async function syncGoogleAvatarForUser(input: { userId: string; imageUrl: string | null | undefined }) {
  if (!input.imageUrl || !isAllowedGoogleAvatarUrl(input.imageUrl)) {
    return null;
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { image: true, avatarSource: true },
  });

  // Uma foto enviada manualmente nunca é sobrescrita por um login Google.
  if (currentUser?.avatarSource === "CUSTOM") {
    return currentUser.image ?? null;
  }

  try {
    const sourceBuffer = await downloadRemoteAvatar(input.imageUrl);
    const dataUri = await normalizeAvatarToDataUri(sourceBuffer, "webp");

    await prisma.user.update({
      where: { id: input.userId },
      data: { image: dataUri, avatarSource: "GOOGLE" },
    });

    return dataUri;
  } catch {
    return currentUser?.image ?? null;
  }
}

/**
 * Resolve a imagem do atleta para uso em relatórios (SVG/PNG renderizados
 * para WhatsApp). `User.image` já é uma data URI base64 (avatar próprio da
 * RYVANO) ou uma URL remota do Google (login sem upload ainda sincronizado);
 * nenhum dos dois casos lê arquivo em disco.
 */
export async function resolveAvatarImageForReport(image: string | null | undefined) {
  if (!image) {
    return null;
  }

  if (isManagedAvatarDataUri(image)) {
    try {
      return await reencodeDataUriForReport(image);
    } catch {
      return null;
    }
  }

  if (isAllowedGoogleAvatarUrl(image)) {
    try {
      const sourceBuffer = await downloadRemoteAvatar(image);
      const normalized = await normalizeAvatarBuffer(sourceBuffer, "png");
      return `data:image/png;base64,${normalized.toString("base64")}`;
    } catch {
      return null;
    }
  }

  return null;
}

function validateUploadFile(file: File) {
  if (!file.size) {
    throw new Error("Selecione uma imagem válida.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("A foto deve ter no máximo 5 MB.");
  }

  if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
    throw new Error("Envie imagem JPG, PNG ou WEBP.");
  }
}

async function downloadRemoteAvatar(imageUrl: string) {
  const response = await fetch(imageUrl, {
    headers: {
      Accept: "image/*",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error("Falha ao baixar foto remota.");
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.startsWith("image/")) {
    throw new Error("Arquivo remoto inválido.");
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);

  if (contentLength && contentLength > MAX_REMOTE_BYTES) {
    throw new Error("Imagem remota muito grande.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length || buffer.length > MAX_REMOTE_BYTES) {
    throw new Error("Imagem remota inválida.");
  }

  return buffer;
}

async function normalizeAvatarBuffer(buffer: Buffer, format: "webp" | "png") {
  const pipeline = sharp(buffer, {
    limitInputPixels: 4096 * 4096,
  })
    .rotate()
    .resize(512, 512, {
      fit: "cover",
      position: "centre",
    });

  if (format === "png") {
    return pipeline.png().toBuffer();
  }

  return pipeline.webp({ quality: 88 }).toBuffer();
}

async function normalizeAvatarToDataUri(buffer: Buffer, format: "webp" | "png") {
  const normalized = await normalizeAvatarBuffer(buffer, format);
  const mimeType = format === "png" ? "image/png" : "image/webp";
  return `data:${mimeType};base64,${normalized.toString("base64")}`;
}

async function reencodeDataUriForReport(dataUri: string) {
  const buffer = decodeDataUriToBuffer(dataUri);
  const pngBuffer = await sharp(buffer, {
    limitInputPixels: 4096 * 4096,
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}

function decodeDataUriToBuffer(dataUri: string) {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  return Buffer.from(base64, "base64");
}

function isManagedAvatarDataUri(image: string | null | undefined): image is string {
  return Boolean(image && image.startsWith("data:image/"));
}

function isAllowedGoogleAvatarUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return false;
    }

    return GOOGLE_AVATAR_HOST_SUFFIXES.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}
