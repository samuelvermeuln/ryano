"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  IconActivityHeartbeat,
  IconBrandWhatsapp,
  IconChartLine,
  IconChecklist,
  IconFileAnalytics,
  IconHome2,
  IconLayoutGrid,
  IconPlugConnected,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { useReducedMotion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";

export type MobileDockIconName =
  | "home"
  | "activities"
  | "evolution"
  | "profile"
  | "overview"
  | "users"
  | "whatsapp"
  | "integrations"
  | "onboarding"
  | "reports";

export type MobileDockItem = {
  href: string;
  label: string;
  icon: MobileDockIconName;
  kind?: "link" | "anchor";
  active?: boolean;
  ariaLabel?: string;
  matchPrefixes?: readonly string[];
};

type MobileDockClientProps = {
  items: readonly MobileDockItem[];
  user?: {
    name?: string | null;
    image?: string | null;
  } | null;
};

const W = 360;
const H = 72;
const R = 24;
const CR = 22;
const GAP = 7;
const NR = CR + GAP;
const CY = 5;
const S = 16;
const HX = Math.sqrt(NR * NR - CY * CY);

export function MobileDockClient({ items }: MobileDockClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentHash = useSyncExternalStore(subscribeToHashChange, getHashSnapshot, () => "");
  const prefersReducedMotion = useReducedMotion();
  const reducedMotion = Boolean(prefersReducedMotion);
  const portalTarget = typeof document === "undefined" ? null : document.body;
  const shadowId = useId();

  const centers = useMemo(() => getCenters(items.length), [items.length]);
  const slotWidth = useMemo(() => getSlotWidth(items.length), [items.length]);
  const activeIndex = getActiveIndex(pathname, currentHash, items);
  const activeItem = items[activeIndex] ?? items[0] ?? null;
  const activeAccent = getDockAccent(activeItem?.icon ?? "home");
  const target = centers[activeIndex] ?? centers[0] ?? W / 2;

  const [cx, setCx] = useState(target);
  const currentCx = useRef(target);
  const raf = useRef<number | null>(null);
  const from = useRef(target);
  const start = useRef(0);

  useEffect(() => {
    currentCx.current = cx;
  }, [cx]);

  useEffect(() => {
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start.current) / 460);
      const eased = 1 - Math.pow(1 - progress, 3);
      const overshoot = Math.sin(progress * Math.PI) * 0.12 * (progress < 1 ? 1 : 0);
      const next = from.current + (target - from.current) * (eased + overshoot * (1 - eased));
      currentCx.current = next;
      setCx(next);

      if (progress < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    };

    if (reducedMotion) {
      raf.current = requestAnimationFrame(() => {
        currentCx.current = target;
        setCx(target);
      });
    } else {
      from.current = currentCx.current;
      start.current = performance.now();
      raf.current = requestAnimationFrame(tick);
    }

    return () => {
      if (raf.current) {
        cancelAnimationFrame(raf.current);
      }
    };
  }, [reducedMotion, target]);

  if (!portalTarget || items.length === 0) {
    return null;
  }

  return createPortal(
    <nav aria-label="Navegação inferior" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 sm:hidden">
      <div className="mx-auto w-full max-w-[380px] px-3 pb-[max(0.45rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto relative w-full select-none" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" role="presentation" aria-hidden="true">
            <defs>
              <filter id={shadowId} x="-30%" y="-80%" width="160%" height="260%">
                <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="oklch(0.22 0.02 240)" floodOpacity="0.16" />
              </filter>
            </defs>
            <g filter={`url(#${shadowId})`}>
              <path d={barPath(cx)} fill="var(--mobile-dock-surface)" />
              <circle cx={cx} cy={CY} r={CR + 4} fill="var(--mobile-dock-surface)" />
              <circle cx={cx} cy={CY} r={CR} fill={activeAccent.active} />
            </g>
          </svg>

          <ul className="absolute inset-0">
            {items.map((item, index) => {
              const active = index === activeIndex;
              const accent = getDockAccent(item.icon);
              const center = centers[index] ?? W / 2;
              const left = items.length === 1 ? 0 : center - slotWidth / 2;
              const width = items.length === 1 ? W : slotWidth;

              return (
                <li
                  key={`${item.kind ?? "link"}-${item.href}`}
                  className="absolute top-0 h-full"
                  style={{
                    left: `${(left / W) * 100}%`,
                    width: `${(width / W) * 100}%`,
                  }}
                >
                  <button
                    type="button"
                    aria-label={item.ariaLabel ?? item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={() => handleItemSelect(item, router, reducedMotion)}
                    className="relative h-full w-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mobile-dock-surface)]"
                  >
                    <span
                      className="pointer-events-none absolute left-1/2 bottom-[26px] flex items-center justify-center transition-[transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        transform: active
                          ? `translate(-50%, ${CY - H / 2 + 7}px) scale(1.03)`
                          : "translate(-50%, -5px) scale(1)",
                      }}
                    >
                      <span
                        className="grid h-6 w-6 place-items-center transition-colors duration-300"
                        style={{ color: active ? "white" : "var(--mobile-dock-muted)" }}
                        aria-hidden="true"
                      >
                        <DockIcon icon={item.icon} active={active} />
                      </span>
                    </span>
                    <span
                      className="pointer-events-none absolute bottom-[12px] left-1/2 w-max text-center text-[5x] font-semibold tracking-[0.01em] transition-all duration-300"
                      style={{
                        color: active ? accent.label : "var(--mobile-dock-muted)",
                        opacity: active ? 1 : 0,
                        transform: active ? "translate(-50%, 0)" : "translate(-50%, 4px)",
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>,
    portalTarget,
  );
}

function subscribeToHashChange(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);

  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}

function getHashSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.hash;
}

function handleItemSelect(item: MobileDockItem, router: ReturnType<typeof useRouter>, reducedMotion: boolean) {
  if (item.kind !== "anchor") {
    router.push(item.href);
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  if (item.href === "#top") {
    const nextUrl = `${window.location.pathname}${window.location.search}#top`;
    window.history.replaceState(null, "", nextUrl);
    window.dispatchEvent(new Event("hashchange"));
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    return;
  }

  const targetId = item.href.slice(1);
  const targetElement = document.getElementById(targetId);

  if (window.location.hash === item.href) {
    targetElement?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    return;
  }

  window.location.hash = targetId;
}

function getActiveIndex(pathname: string, currentHash: string, items: readonly MobileDockItem[]) {
  const activeIndex = items.findIndex((item) => {
    if (typeof item.active === "boolean") {
      return item.active;
    }

    if (item.kind === "anchor") {
      if (!currentHash) {
        return item.href === "#top";
      }

      return currentHash === item.href;
    }

    const candidates = item.matchPrefixes?.length ? item.matchPrefixes : [item.href];
    return candidates.some((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
  });

  return activeIndex === -1 ? 0 : activeIndex;
}

function getCenters(count: number) {
  if (count <= 1) {
    return [W / 2];
  }

  const minX = R + S + HX;
  const maxX = W - minX;

  return Array.from({ length: count }, (_, index) => minX + ((maxX - minX) * index) / (count - 1));
}

function getSlotWidth(count: number) {
  if (count <= 1) {
    return W;
  }

  const minX = R + S + HX;
  const maxX = W - minX;
  return (maxX - minX) / (count - 1);
}

function barPath(cx: number) {
  const clamped = Math.max(R + S + HX, Math.min(W - R - S - HX, cx));

  return [
    `M ${R} 0`,
    `H ${clamped - HX - S}`,
    `C ${clamped - HX - S / 2} 0, ${clamped - HX - S / 4} 0, ${clamped - HX} 0`,
    `A ${NR} ${NR} 0 1 0 ${clamped + HX} 0`,
    `C ${clamped + HX + S / 4} 0, ${clamped + HX + S / 2} 0, ${clamped + HX + S} 0`,
    `H ${W - R}`,
    `A ${R} ${R} 0 0 1 ${W} ${R}`,
    `V ${H - R}`,
    `A ${R} ${R} 0 0 1 ${W - R} ${H}`,
    `H ${R}`,
    `A ${R} ${R} 0 0 1 0 ${H - R}`,
    `V ${R}`,
    `A ${R} ${R} 0 0 1 ${R} 0`,
    "Z",
  ].join(" ");
}

function getDockAccent(icon: MobileDockIconName) {
  switch (icon) {
    case "activities":
      return {
        active: "oklch(0.77 0.13 180)",
        label: "oklch(0.45 0.08 180)",
      };
    case "evolution":
      return {
        active: "oklch(0.72 0.14 286)",
        label: "oklch(0.43 0.11 286)",
      };
    case "profile":
      return {
        active: "oklch(0.76 0.11 214)",
        label: "oklch(0.41 0.08 214)",
      };
    case "users":
      return {
        active: "oklch(0.77 0.13 54)",
        label: "oklch(0.52 0.09 54)",
      };
    case "whatsapp":
      return {
        active: "oklch(0.76 0.16 151)",
        label: "oklch(0.44 0.1 151)",
      };
    case "integrations":
      return {
        active: "oklch(0.76 0.12 205)",
        label: "oklch(0.41 0.08 205)",
      };
    case "onboarding":
      return {
        active: "oklch(0.79 0.12 84)",
        label: "oklch(0.51 0.08 84)",
      };
    case "reports":
      return {
        active: "oklch(0.73 0.13 302)",
        label: "oklch(0.43 0.1 302)",
      };
    case "overview":
      return {
        active: "oklch(0.74 0.11 230)",
        label: "oklch(0.4 0.08 230)",
      };
    case "home":
    default:
      return {
        active: "var(--mobile-dock-active)",
        label: "var(--mobile-dock-foreground)",
      };
  }
}

function DockIcon({
  icon,
  active,
}: {
  icon: MobileDockIconName;
  active: boolean;
}) {
  const className = active ? "text-current" : "text-current";
  const size = active ? 24 : 22;
  const stroke = active ? 2.15 : 2;

  switch (icon) {
    case "activities":
      return <IconActivityHeartbeat size={size} stroke={stroke} aria-hidden="true" className={className} />;
    case "evolution":
      return <IconChartLine size={size} stroke={stroke} aria-hidden="true" className={className} />;
    case "overview":
      return <IconLayoutGrid size={size} stroke={stroke} aria-hidden="true" className={className} />;
    case "users":
      return <IconUsers size={size} stroke={stroke} aria-hidden="true" className={className} />;
    case "whatsapp":
      return <IconBrandWhatsapp size={size} stroke={stroke} aria-hidden="true" className={className} />;
    case "integrations":
      return <IconPlugConnected size={size} stroke={stroke} aria-hidden="true" className={className} />;
    case "onboarding":
      return <IconChecklist size={size} stroke={stroke} aria-hidden="true" className={className} />;
    case "reports":
      return <IconFileAnalytics size={size} stroke={stroke} aria-hidden="true" className={className} />;
    case "profile":
      return <IconUser size={size} stroke={stroke} aria-hidden="true" className={className} />;
    case "home":
    default:
      return <IconHome2 size={size} stroke={stroke} aria-hidden="true" className={className} />;
  }
}
