type StatusBadgeProps = {
  children: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

const toneClassMap = {
  neutral: "border-white/10 bg-white/6 text-foreground/72",
  success: "border-emerald-300/18 bg-emerald-300/10 text-emerald-100",
  warning: "border-amber-300/18 bg-amber-300/10 text-amber-100",
  danger: "border-rose-300/18 bg-rose-300/10 text-rose-100",
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${toneClassMap[tone]}`}>
      {children}
    </span>
  );
}
