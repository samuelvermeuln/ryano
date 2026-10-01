"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconSend } from "@tabler/icons-react";

import { UserAvatar } from "@/components/user-avatar";

export type WorkoutCommentView = {
  id: string;
  kind: "COMMENT" | "REVIEW_REQUEST";
  body: string;
  createdAt: string;
  resolvedAt: string | null;
  author: { id: string; name: string | null; image: string | null };
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * SAM-27 — the athlete ↔ coach conversation on one prescription, shared by the
 * athlete's and the coach's detail screens so both read the same thread. The
 * server decides who may read or write; this only posts to the route.
 */
export function WorkoutCommentsThread({
  assignmentId,
  comments,
  viewerId,
  placeholder = "Escreva para o professor…",
}: {
  assignmentId: string;
  comments: WorkoutCommentView[];
  viewerId: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/workout-assignments/${assignmentId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
          setError(data.message ?? "Não foi possível enviar o comentário.");
          return;
        }
        setBody("");
        router.refresh();
      } catch {
        setError("Não foi possível enviar o comentário.");
      }
    });
  };

  return (
    <div className="space-y-3" data-testid="workout-comments">
      {comments.length === 0 ? (
        <p className="text-sm text-foreground/50">Nenhum comentário ainda. A conversa sobre este treino começa aqui.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => {
            const mine = comment.author.id === viewerId;
            return (
              <li
                key={comment.id}
                data-testid="workout-comment"
                className={`flex gap-3 rounded-[16px] border px-3 py-2.5 text-sm ${
                  comment.kind === "REVIEW_REQUEST" ? "theme-panel-warning" : "border-border bg-white/[0.04]"
                }`}
              >
                <UserAvatar name={comment.author.name ?? "Participante"} image={comment.author.image} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-foreground/55">
                    <span className="font-medium text-foreground/80">{mine ? "Você" : comment.author.name ?? "Participante"}</span>
                    <span>{formatWhen(comment.createdAt)}</span>
                    {comment.kind === "REVIEW_REQUEST" ? (
                      <span className="font-medium">{comment.resolvedAt ? "Revisão feita" : "Pediu revisão"}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-foreground/85">{comment.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Novo comentário</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, 2000))}
            rows={2}
            placeholder={placeholder}
            aria-label="Novo comentário"
            className="glass-input w-full resize-none rounded-[14px] px-3 py-2 text-sm text-foreground outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={isPending || body.trim().length === 0}
          aria-busy={isPending}
          className="glass-button-primary inline-flex h-10 items-center gap-2 rounded-[14px] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend size={16} />}
          Comentar
        </button>
      </form>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
