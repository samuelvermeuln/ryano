import type { ReactNode } from "react";

type AuroraBackgroundProps = {
  children: ReactNode;
  className?: string;
};

export function AuroraBackground({
  children,
  className = "",
}: AuroraBackgroundProps) {
  return (
    <div className={`aurora-bg relative isolate overflow-hidden ${className}`}>
      <div
        aria-hidden
        className="blob left-[-6rem] top-[-4rem] h-80 w-80 bg-[oklch(0.8_0.12_220_/_0.34)]"
      />
      <div
        aria-hidden
        className="blob right-[-8rem] top-20 h-96 w-96 bg-[oklch(0.82_0.11_195_/_0.28)]"
        style={{ animationDelay: "-8s" }}
      />
      <div
        aria-hidden
        className="blob bottom-[-4rem] left-1/3 h-72 w-72 bg-[oklch(0.8_0.14_165_/_0.22)]"
        style={{ animationDelay: "-14s" }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
