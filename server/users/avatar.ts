import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import sharp from "sharp";

import { prisma } from "@/server/db";

const AVATAR_PUBLIC_ROOT = "/uploads/avatars";
const AVATAR_STORAGE_ROOT = join(process.cwd(), "public", "uploads", "avatars");
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_REMOTE_BYTES = 8 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const GOOGLE_AVATAR_HOST_SUFFIXES = ["googleusercontent.com", "ggpht.com"];

export async function uploadUserAvatar(input: { userId: string; file: File }) {
  validateUploadFile(input.file);

  const currentUser = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { image: true },
  });

  const sourceBuffer = Buffer.from(await input.file.arrayBuffer());
  const normalized = await normalizeAvatarBuffer(sourceBuffer, "webp");
  const publicPath = await writeAvatarBuffer({
    userId: input.userId,
    variant: "custom",
    buffer: normalized,
  });

  await prisma.user.update({
    where: { id: input.userId },
    data: { image: publicPath },
  });

  await deleteManagedAvatar(currentUser?.image, publicPath);

  return publicPath;
}

export async function syncGoogleAvatarForUser(input: { userId: string; imageUrl: string | null | undefined }) {
  if (!input.imageUrl || !isAllowedGoogleAvatarUrl(input.imageUrl)) {
    return null;
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { image: true },
  });

  if (isCustomAvatarPath(currentUser?.image)) {
    return currentUser?.image ?? null;
  }

  try {
    const sourceBuffer = await downloadRemoteAvatar(input.imageUrl);
    const normalized = await normalizeAvatarBuffer(sourceBuffer, "webp");
    const publicPath = await writeAvatarBuffer({
      userId: input.userId,
      variant: "google",
      buffer: normalized,
    });

    await prisma.user.update({
      where: { id: input.userId },
      data: { image: publicPath },
    });

    await deleteManagedAvatar(currentUser?.image, publicPath);

    return publicPath;
  } catch {
    return currentUser?.image ?? null;
  }
}

export async function resolveAvatarImageForReport(image: string | null | undefined) {
  if (!image) {
    return null;
  }

  if (isManagedAvatarPath(image)) {
    try {
      const absolutePath = getManagedAvatarAbsolutePath(image);
      const buffer = await readFile(absolutePath);
      return await encodeAvatarBufferForReport(buffer);
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

async function encodeAvatarBufferForReport(buffer: Buffer) {
  const pngBuffer = await sharp(buffer, {
    limitInputPixels: 4096 * 4096,
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}

async function writeAvatarBuffer(input: {
  userId: string;
  variant: "custom" | "google";
  buffer: Buffer;
}) {
  const directory = join(AVATAR_STORAGE_ROOT, input.variant);
  await mkdir(directory, { recursive: true });

  const fileName = `${input.userId}-${Date.now()}-${randomUUID()}.webp`;
  const absolutePath = join(directory, fileName);

  await writeFile(absolutePath, input.buffer);

  return `${AVATAR_PUBLIC_ROOT}/${input.variant}/${fileName}`;
}

async function deleteManagedAvatar(image: string | null | undefined, keepImage?: string | null) {
  if (!image || image === keepImage || !isManagedAvatarPath(image)) {
    return;
  }

  try {
    await unlink(getManagedAvatarAbsolutePath(image));
  } catch {
    return;
  }
}

function getManagedAvatarAbsolutePath(image: string) {
  const relativePath = image.slice(1);
  const absolutePath = resolve(process.cwd(), "public", relativePath);
  const rootPath = resolve(AVATAR_STORAGE_ROOT);
  const pathRelativeToRoot = relative(rootPath, absolutePath);

  if (pathRelativeToRoot.startsWith("..") || isAbsolute(pathRelativeToRoot)) {
    throw new Error("Avatar path inválido.");
  }

  return absolutePath;
}

function isManagedAvatarPath(image: string | null | undefined): image is string {
  return Boolean(image && image.startsWith(`${AVATAR_PUBLIC_ROOT}/`));
}

function isCustomAvatarPath(image: string | null | undefined) {
  return Boolean(image && image.startsWith(`${AVATAR_PUBLIC_ROOT}/custom/`));
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
