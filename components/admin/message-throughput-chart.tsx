type MessageThroughputChartProps = {
  buckets: Array<{
    label: string;
    sent: number;
    failed: number;
  }>;
};

export function MessageThroughputChart({ buckets }: MessageThroughputChartProps) {
  const maxValue = Math.max(1, ...buckets.flatMap((bucket) => [bucket.sent, bucket.failed]));

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {buckets.map((bucket) => (
        <div key={bucket.label} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{bucket.label}</p>
            <p className="text-xs text-foreground/55">{bucket.sent + bucket.failed} evt</p>
          </div>

          <div className="mt-4 space-y-3">
            <MetricBar label="Enviadas" value={bucket.sent} maxValue={maxValue} tone="sent" />
            <MetricBar label="Falhas" value={bucket.failed} maxValue={maxValue} tone="failed" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricBar({
  label,
  value,
  maxValue,
  tone,
}: {
  label: string;
  value: number;
  maxValue: number;
  tone: "sent" | "failed";
}) {
  const width = `${Math.max(6, Math.round((value / maxValue) * 100))}%`;
  const barClass = tone === "sent" ? "bg-emerald-400/80" : "bg-rose-400/80";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-xs text-foreground/60">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/20">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: value > 0 ? width : "0%" }} />
      </div>
    </div>
  );
}
