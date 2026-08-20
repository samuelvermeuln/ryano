"use client";

import type { ComponentProps } from "react";
import { Icon } from "@iconify/react";

import type { Sport } from "@/components/landing-athlete-data";

type SportIconName = Sport | "triathlon" | "multisport" | "walking" | "strength" | "default";

type SportIconProps = {
  sport: SportIconName;
  size?: number;
  className?: string;
  decorative?: boolean;
  label?: string;
} & Omit<ComponentProps<typeof Icon>, "icon">;

const iconBySport: Record<SportIconName, string> = {
  swim: "mdi:swim",
  bike: "mdi:bike-fast",
  run: "mdi:run-fast",
  triathlon: "mdi:medal-outline",
  multisport: "mdi:medal-outline",
  walking: "mdi:walk",
  strength: "mdi:dumbbell",
  default: "mdi:heart-pulse",
};

const labelBySport: Record<SportIconName, string> = {
  swim: "Natação",
  bike: "Ciclismo",
  run: "Corrida",
  triathlon: "Triatlo",
  multisport: "Multisport",
  walking: "Caminhada",
  strength: "Força",
  default: "Atividade",
};

export function SportIcon({
  sport,
  size = 24,
  className,
  decorative = true,
  label,
  ...props
}: SportIconProps) {
  return (
    <Icon
      icon={iconBySport[sport]}
      width={size}
      height={size}
      className={className}
      aria-hidden={decorative}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label ?? labelBySport[sport]}
      {...props}
    />
  );
}

export function sportLabel(sport: SportIconName) {
  return labelBySport[sport];
}
