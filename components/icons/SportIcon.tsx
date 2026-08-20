"use client";

import type { ComponentProps } from "react";
import { Icon } from "@iconify/react";

import { getSportLabel, sportConfig, type SportIconName } from "@/lib/sports";

type SportIconProps = {
  sport: SportIconName;
  size?: number;
  className?: string;
  decorative?: boolean;
  label?: string;
} & Omit<ComponentProps<typeof Icon>, "icon">;

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
      icon={sportConfig[sport].icon}
      width={size}
      height={size}
      className={className}
      aria-hidden={decorative}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label ?? getSportLabel(sport)}
      {...props}
    />
  );
}

export function sportLabel(sport: SportIconName) {
  return getSportLabel(sport);
}
