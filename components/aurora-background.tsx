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
        className="blob h-80 w-80 bg-[oklch(0.6_0.18_245_/_0.34)] left-[-6rem] top-[-4rem]"
      />
      <div
        aria-hidden
        className="blob h-96 w-96 bg-[oklch(0.68_0.14_210_/_0.28)] right-[-8rem] top-20"
        style={{ animationDelay: "-8s" }}
      />
      <div
        aria-hidden
        className="blob h-72 w-72 bg-[oklch(0.78_0.14_200_/_0.18)] bottom-[-4rem] left-1/3"
        style={{ animationDelay: "-14s" }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
