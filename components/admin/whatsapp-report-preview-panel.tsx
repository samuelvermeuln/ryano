type WhatsAppReportPreviewPanelProps = {
  previews: Array<{
    id: string;
    label: string;
    description: string;
    href: string | null;
    unavailableReason?: string | null;
  }>;
};

export function WhatsAppReportPreviewPanel({ previews }: WhatsAppReportPreviewPanelProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {previews.map((preview) => (
        <div key={preview.id} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{preview.label}</p>
            <p className="text-sm leading-6 text-foreground/62">{preview.description}</p>
          </div>

          <div className="mt-4">
            {preview.href ? (
              <a
                href={preview.href}
                target="_blank"
                rel="noreferrer"
                className="glass-button inline-flex rounded-[18px] px-4 py-2 text-sm font-medium text-foreground"
              >
                Abrir preview PNG
              </a>
            ) : (
              <p className="text-sm text-amber-200/90">{preview.unavailableReason ?? "Preview indisponível agora."}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
