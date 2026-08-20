import { ImageResponse } from "next/og";

export const alt = "RYANO — Seus treinos analisados no WhatsApp";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background: "linear-gradient(135deg, #12333f 0%, #164b55 35%, #0f766e 100%)",
          color: "#f8fafc",
          padding: "56px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flex: 1,
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: "32px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05))",
            padding: "42px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", width: "62%" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                fontSize: "22px",
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                opacity: 0.86,
              }}
            >
              <span>RYANO</span>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "999px",
                  background: "#38bdf8",
                }}
              />
            </div>
            <div style={{ marginTop: "34px", display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ fontSize: "68px", fontWeight: 700, lineHeight: 1.05 }}>
                Seus treinos analisados no WhatsApp
              </div>
              <div style={{ fontSize: "28px", lineHeight: 1.45, color: "rgba(248,250,252,0.82)" }}>
                Corrida, ciclismo, natação e triathlon com leitura rápida de distância, ritmo, frequência cardíaca e evolução.
              </div>
            </div>
            <div style={{ display: "flex", gap: "14px", marginTop: "auto" }}>
              {[
                ["Natação", "#38bdf8"],
                ["Ciclismo", "#4ade80"],
                ["Corrida", "#fb923c"],
                ["Triathlon", "#a78bfa"],
              ].map(([label, color]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.08)",
                    padding: "10px 18px",
                    fontSize: "20px",
                  }}
                >
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "999px",
                      background: color,
                    }}
                  />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: "31%",
              borderRadius: "32px",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "linear-gradient(180deg, rgba(7,94,84,0.92), rgba(18,51,63,0.9))",
              padding: "24px",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#ffffff" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "18px", opacity: 0.76 }}>Relatório pós-atividade</div>
                <div style={{ fontSize: "26px", fontWeight: 700 }}>Corrida concluída</div>
              </div>
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.18)",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                ["Distância", "8,4 km"],
                ["Tempo", "44:31"],
                ["Ritmo médio", "5:18 /km"],
                ["FC média", "151 bpm"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: "18px",
                    background: "#ffffff",
                    color: "#111b21",
                    padding: "14px 16px",
                    gap: "6px",
                  }}
                >
                  <div style={{ fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.18em", color: "#667781" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
