import type { NavIconName } from "@/lib/navigation";

export function NavIcon({ name, size = 24 }: { name: NavIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {name === "dashboard" ? <path d="M4 13h7V4H4v9Zm9 7h7V11h-7v9Zm0-16v5h7V4h-7ZM4 20h7v-5H4v5Z" fill="currentColor" /> : null}
      {name === "activities" ? <path d="M4 14h3l2-4 4 8 2-4h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {name === "integrations" ? <path d="M8.5 8.5h-2A2.5 2.5 0 0 0 4 11v2a2.5 2.5 0 0 0 2.5 2.5h2m7-7h2A2.5 2.5 0 0 1 20 11v2a2.5 2.5 0 0 1-2.5 2.5h-2M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {name === "reports" ? <><path d="M6 20V9m6 11V4m6 16v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></> : null}
      {name === "profile" ? <><circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" /><path d="M6 19c1.7-2.6 4-3.9 6-3.9s4.3 1.3 6 3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></> : null}
      {name === "security" ? <><path d="M12 3 5 6v5c0 5 3.4 8.1 7 10 3.6-1.9 7-5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9.5 12.2 11.2 14 14.8 10.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></> : null}
      {name === "overview" ? <><path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M7 15V9m5 6V6m5 9v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></> : null}
      {name === "users" ? <><circle cx="9" cy="9" r="2.6" stroke="currentColor" strokeWidth="1.8" /><circle cx="16.5" cy="10.5" r="2.1" stroke="currentColor" strokeWidth="1.6" /><path d="M4.8 18c1.5-2.1 3.2-3.1 5.2-3.1 2 0 3.7 1 5.2 3.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M14.7 17.4c.7-1.1 1.7-1.8 3.1-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></> : null}
      {name === "whatsapp" ? <><path d="M12 4a8 8 0 0 0-6.9 12l-1.1 4 4.1-1A8 8 0 1 0 12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9.3 9.4c.3 1.3 1.9 3.1 3.5 4 .5.2 1 .2 1.3-.2l.8-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></> : null}
      {name === "onboarding" ? <><path d="M6 12.5 10.2 17 18 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></> : null}
      {name === "school" ? <><path d="M3 21V9l9-6 9 6v12" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 21V15h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M12 7v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></> : null}
      {name === "team" ? <><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.8" /><circle cx="16" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.8" /><path d="M4 18c1.2-2.4 3-3.5 4-3.5s2.8 1.1 4 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M14.5 16.5c.7-1.1 1.6-2 2.5-2s2.2 1 3.1 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></> : null}
      {name === "workout" ? <><path d="M4 12h2.5m11 0H20m-8-7v2m0 10v2M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /></> : null}
      {name === "requests" ? <><path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-6-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M15 3v6h6M9 17l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></> : null}
      {name === "invites" ? <><rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M3 10l9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M8 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></> : null}
    </svg>
  );
}
