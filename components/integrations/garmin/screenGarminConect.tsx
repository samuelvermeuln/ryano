"use client";

import { useState } from "react";
import { GarminScreen } from "@/components/integrations/garmin/garminScreen";

import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";

type ScreenGarminConectProps = {
  connection: {
    status: string;
    lastSyncAt: Date | null;
    lastSyncStatus: string | null;
  } | null;
};

export function ScreenGarminConect({ connection }: ScreenGarminConectProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const connected = connection?.status === "CONNECTED";

  return (
    <>
      <SectionCard
        title="Garmin"
        description="Conecte sua conta para trazer seus treinos automaticamente."
        action={
          <StatusBadge tone={connected ? "success" : "warning"}>
            {connected ? "Garmin conectado" : "Garmin não conectado"}
          </StatusBadge>
        }
      >
        <div className="space-y-5">
          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-foreground/72">
            <p>Conecte sua conta Garmin para começar a sincronizar seus treinos no RYVANO.</p>
          </div>

          {!connected ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="glass-button-primary rounded-[18px] px-5 py-3 text-sm font-semibold"
            >
              Conectar com o Garmin
            </button>
          ) : (
            <GarminScreen connection={connection} />
          )}
        </div>
      </SectionCard>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2 sm:p-4 md:p-6">
          <div className="flex min-h-full items-center justify-center">
            <div className="glass-strong relative h-[calc(100dvh-1rem)] w-full max-w-6xl overflow-hidden rounded-[20px] border border-white/10 shadow-2xl sm:h-[calc(100dvh-2rem)] md:h-[min(860px,calc(100dvh-3rem))]">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="absolute right-4 top-4 z-20 rounded-full bg-black/20 p-1.5 text-white/80 backdrop-blur transition hover:text-white"
              >
                <span className="sr-only">Fechar modal</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <GarminScreen connection={connection} fullHeight />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
