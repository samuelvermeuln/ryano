"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconCheck, IconLoader2, IconUpload } from "@tabler/icons-react";

import { UserAvatar } from "@/components/user-avatar";

type ProfileAvatarUploaderProps = {
  name: string;
  image?: string | null;
};

type UploadNotice = {
  tone: "success" | "danger";
  message: string;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ProfileAvatarUploader({ name, image }: ProfileAvatarUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<UploadNotice | null>(null);

  useEffect(() => () => {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [previewUrl]);

  const avatarImage = useMemo(() => previewUrl ?? image ?? null, [image, previewUrl]);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    if (!ACCEPTED_TYPES.has(file.type)) {
      setSelectedFile(null);
      setNotice({ tone: "danger", message: "Envie imagem JPG, PNG ou WEBP." });
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setSelectedFile(null);
      setNotice({ tone: "danger", message: "A foto deve ter no máximo 5 MB." });
      event.target.value = "";
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);

    setPreviewUrl((current) => {
      if (current?.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }

      return nextPreviewUrl;
    });
    setSelectedFile(file);
    setNotice(null);
  }

  async function uploadAvatar() {
    if (!selectedFile || pending) {
      return;
    }

    setPending(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.set("file", selectedFile);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null) as { image?: string; error?: string } | null;

      if (!response.ok || !payload?.image) {
        setNotice({ tone: "danger", message: payload?.error ?? "Não foi possível atualizar sua foto agora." });
        return;
      }

      setPreviewUrl((current) => {
        if (current?.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }

        return payload.image ?? null;
      });
      setSelectedFile(null);
      setNotice({ tone: "success", message: "Foto atualizada. Ela será usada nos relatórios enviados no WhatsApp." });

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      router.refresh();
    } catch {
      setNotice({ tone: "danger", message: "Não foi possível atualizar sua foto agora." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <UserAvatar name={name} image={avatarImage} size="lg" />

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={openPicker}
          className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 text-xs font-medium text-foreground transition hover:bg-white/12"
        >
          <IconUpload size={14} />
          Escolher foto
        </button>

        {selectedFile ? (
          <button
            type="button"
            onClick={uploadAvatar}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/12 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/18 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? <IconLoader2 size={14} className="animate-spin" /> : <IconCheck size={14} />}
            {pending ? "Enviando..." : "Salvar foto"}
          </button>
        ) : null}

        <p className="max-w-[180px] text-[11px] leading-5 text-foreground/52">
          Login com Google importa foto automaticamente. Você pode trocar quando quiser.
        </p>

        {notice ? (
          <div className={`inline-flex max-w-[220px] items-start gap-2 rounded-2xl border px-3 py-2 text-[11px] leading-5 ${notice.tone === "success" ? "theme-panel-success" : "theme-panel-danger"}`}>
            {notice.tone === "success" ? <IconCheck size={14} className="mt-0.5 shrink-0" /> : <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />}
            <span>{notice.message}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
