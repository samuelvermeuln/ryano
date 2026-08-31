import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

// --- Mocks (hoisted) -------------------------------------------------------
// Prisma é mockado para exercitar `uploadUserAvatar`/`syncGoogleAvatarForUser`
// de forma determinística e offline, sem banco real. `sharp` NÃO é mockado:
// é dependência real do projeto e normaliza buffers de imagem reais gerados
// nos próprios testes (mais simples e mais fiel do que mockar a lib nativa).
vi.mock("@/server/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/server/db";
import {
  resolveAvatarImageForReport,
  syncGoogleAvatarForUser,
  uploadUserAvatar,
} from "@/server/users/avatar";

const findUniqueMock = vi.mocked(prisma.user.findUnique);
const updateMock = vi.mocked(prisma.user.update);

// --- Fixtures ---------------------------------------------------------------
// PNG 1x1 real gerado via sharp (mesma lib usada em produção), reaproveitado
// como fonte para uploads, downloads remotos e data URIs de entrada.
async function makePngBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
}

async function makeWebpDataUri(): Promise<string> {
  const png = await makePngBuffer();
  const webp = await sharp(png).webp().toBuffer();
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

function makeFile(buffer: Buffer, type: string, name = "avatar.png"): File {
  return new File([new Uint8Array(buffer)], name, { type });
}

describe("uploadUserAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normaliza um arquivo válido para data URI webp e grava avatarSource CUSTOM", async () => {
    const png = await makePngBuffer();
    const file = makeFile(png, "image/png");
    updateMock.mockResolvedValue({} as never);

    const result = await uploadUserAvatar({ userId: "user_1", file });

    expect(result.startsWith("data:image/webp;base64,")).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0]![0] as {
      where: { id: string };
      data: { image: string; avatarSource: string };
    };
    expect(call.where).toEqual({ id: "user_1" });
    expect(call.data.avatarSource).toBe("CUSTOM");
    expect(call.data.image).toBe(result);
  });

  it("rejeita arquivo vazio (size === 0) sem chamar prisma.user.update", async () => {
    const file = makeFile(Buffer.alloc(0), "image/png");

    await expect(uploadUserAvatar({ userId: "user_1", file })).rejects.toThrow();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejeita arquivo maior que 5MB sem chamar prisma.user.update", async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    const file = makeFile(oversized, "image/png");

    await expect(uploadUserAvatar({ userId: "user_1", file })).rejects.toThrow();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejeita tipo MIME fora de jpeg/png/webp sem chamar prisma.user.update", async () => {
    const png = await makePngBuffer();
    const file = makeFile(png, "image/gif", "avatar.gif");

    await expect(uploadUserAvatar({ userId: "user_1", file })).rejects.toThrow();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("syncGoogleAvatarForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna null para imageUrl null/undefined sem tocar prisma", async () => {
    const resultNull = await syncGoogleAvatarForUser({ userId: "user_1", imageUrl: null });
    const resultUndefined = await syncGoogleAvatarForUser({ userId: "user_1", imageUrl: undefined });

    expect(resultNull).toBeNull();
    expect(resultUndefined).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("retorna null para URL não permitida (não-Google) sem tocar prisma", async () => {
    const result = await syncGoogleAvatarForUser({
      userId: "user_1",
      imageUrl: "https://evil.example.com/x.png",
    });

    expect(result).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("não sobrescreve avatar CUSTOM: retorna a imagem atual sem chamar fetch nem update", async () => {
    findUniqueMock.mockResolvedValue({
      image: "data:image/webp;base64,AAA",
      avatarSource: "CUSTOM",
    } as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await syncGoogleAvatarForUser({
      userId: "user_1",
      imageUrl: "https://lh3.googleusercontent.com/a/foo",
    });

    expect(result).toBe("data:image/webp;base64,AAA");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("baixa e normaliza avatar Google quando avatarSource não é CUSTOM, gravando avatarSource GOOGLE", async () => {
    findUniqueMock.mockResolvedValue({
      image: null,
      avatarSource: null,
    } as never);
    updateMock.mockResolvedValue({} as never);

    const png = await makePngBuffer();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (key: string) => {
          if (key === "content-type") return "image/png";
          if (key === "content-length") return String(png.length);
          return null;
        },
      },
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await syncGoogleAvatarForUser({
      userId: "user_1",
      imageUrl: "https://lh3.googleusercontent.com/a/foo",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect((result as string).startsWith("data:image/webp;base64,")).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0]![0] as {
      where: { id: string };
      data: { image: string; avatarSource: string };
    };
    expect(call.where).toEqual({ id: "user_1" });
    expect(call.data.avatarSource).toBe("GOOGLE");
    expect(call.data.image).toBe(result);
  });

  it("também sincroniza quando avatarSource é GOOGLE (não bloqueia re-sync entre logins Google)", async () => {
    findUniqueMock.mockResolvedValue({
      image: "data:image/webp;base64,OLD",
      avatarSource: "GOOGLE",
    } as never);
    updateMock.mockResolvedValue({} as never);

    const png = await makePngBuffer();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (key: string) => {
          if (key === "content-type") return "image/png";
          if (key === "content-length") return String(png.length);
          return null;
        },
      },
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await syncGoogleAvatarForUser({
      userId: "user_1",
      imageUrl: "https://lh3.googleusercontent.com/a/foo",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0]![0] as { data: { avatarSource: string } };
    expect(call.data.avatarSource).toBe("GOOGLE");
    expect(result).not.toBe("data:image/webp;base64,OLD");
  });
});

describe("resolveAvatarImageForReport", () => {
  it("retorna null para null/undefined", async () => {
    expect(await resolveAvatarImageForReport(null)).toBeNull();
    expect(await resolveAvatarImageForReport(undefined)).toBeNull();
  });

  it("reencoda uma data URI gerenciada válida para uma nova data URI PNG", async () => {
    const dataUri = await makeWebpDataUri();

    const result = await resolveAvatarImageForReport(dataUri);

    expect(result).not.toBeNull();
    expect((result as string).startsWith("data:image/png;base64,")).toBe(true);
  });

  it("retorna null para string que não é data URI nem URL Google permitida (inclui caminho legado /uploads/avatars)", async () => {
    const resultExternalUrl = await resolveAvatarImageForReport("https://example.com/foo.png");
    const resultLegacyPath = await resolveAvatarImageForReport(
      "/uploads/avatars/custom/old-path.webp",
    );

    expect(resultExternalUrl).toBeNull();
    expect(resultLegacyPath).toBeNull();
  });
});
