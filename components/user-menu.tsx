"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconSettings, IconUserCircle } from "@tabler/icons-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { UserAvatar } from "@/components/user-avatar";

type UserMenuItem = {
  href: string;
  label: string;
};

type UserMenuProps = {
  userName: string;
  userImage?: string | null;
  items: readonly UserMenuItem[];
  compact?: boolean;
  align?: "left" | "right";
};

export function UserMenu({ userName, userImage, items, compact = false, align = "right" }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstName = useMemo(() => userName.split(" ").filter(Boolean)[0] ?? userName, [userName]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={compact ? `Abrir menu de ${firstName}` : undefined}
        onClick={() => setOpen((current) => !current)}
        className={` flex items-center gap-3 rounded-full text-foreground ${compact ? "h-12 w-12 justify-center p-0" : "px-2.5 py-2 pr-3"}`}
      >
        <UserAvatar name={userName} image={userImage} size={compact ? "sm" : "md"} />
        {!compact ? (
          <>
            <span className="max-w-[9rem] truncate text-sm font-semibold">{firstName}</span>
            <IconChevronDown size={16} className={`transition ${open ? "rotate-180" : "rotate-0"}`} />
          </>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className={`glass-strong absolute top-[calc(100%+0.75rem)] z-40 w-56 rounded-[20px] p-2 ${align === "left" ? "left-0" : "right-0"}`}
        >
          <div className="border-b border-white/10 px-3 py-3">
            <p className="text-sm font-semibold text-foreground">{firstName}</p>
            <p className="mt-1 truncate text-xs text-foreground/55">{userName}</p>
          </div>

          <div className="mt-2 grid gap-1">
            {items.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-[16px] px-3 py-3 text-sm text-foreground/76 transition hover:bg-white/8 hover:text-foreground"
              >
                {index === 0 ? <IconUserCircle size={18} /> : <IconSettings size={18} />}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          <div className="mt-2 border-t border-white/10 pt-2">
            <LogoutButton
              className="flex w-full items-center justify-center rounded-[16px] px-3 py-3 text-sm font-semibold"
              onClick={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
