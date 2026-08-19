export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 px-5 py-6 text-sm leading-7 text-foreground/68">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-2">{description}</p>
    </div>
  );
}
