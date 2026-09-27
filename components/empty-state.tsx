import type { ReactNode } from "react";

/**
 * `action` is optional so every existing call site keeps working unchanged. It
 * exists because an empty state that explains the absence but offers no way out
 * of it leaves the user to hunt for the button themselves.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-6 text-sm leading-7 text-foreground/68">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-2">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
