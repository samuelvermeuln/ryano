type StatusBadgeProps = {
  children: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

const toneClassMap = {
  neutral: "theme-pill-neutral",
  success: "theme-pill-success",
  warning: "theme-pill-warning",
  danger: "theme-pill-danger",
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${toneClassMap[tone]}`}>
      {children}
    </span>
  );
}
