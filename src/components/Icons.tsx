type P = { className?: string };
const base = "stroke-current fill-none";

export function ShirtIcon({ className = "h-7 w-7" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={`${base} ${className}`} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4l4 3 4-3 6 3.5-2.5 5L21 11v17H11V11l-2.5 1.5L6 7.5 12 4Z" />
      <path d="M12 4c0 2.2 1.8 4 4 4s4-1.8 4-4" />
      <path d="M16 13v13" strokeDasharray="1.5 2.5" opacity=".55" />
    </svg>
  );
}

export function DressIcon({ className = "h-7 w-7" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={`${base} ${className}`} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* bretelles, décolleté en V, taille marquée, jupe évasée */}
      <path d="M12.2 4h7.6l-1.1 5.4a3 3 0 0 0 .2 2l4.7 15.1a1.5 1.5 0 0 1-1.4 1.9H9.8a1.5 1.5 0 0 1-1.4-1.9l4.7-15.1a3 3 0 0 0 .2-2L12.2 4Z" />
      <path d="M12.2 4 16 7.8 19.8 4" />
      <path d="M13.1 14.2h5.8" opacity=".55" />
    </svg>
  );
}

export function LinenIcon({ className = "h-7 w-7" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={`${base} ${className}`} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="6.5" width="22" height="5" rx="1.4" />
      <rect x="5" y="13.5" width="22" height="5" rx="1.4" />
      <rect x="5" y="20.5" width="22" height="5" rx="1.4" />
      <path d="M9 9h3M9 16h3M9 23h3" opacity=".5" />
    </svg>
  );
}

export function SuitIcon({ className = "h-7 w-7" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={`${base} ${className}`} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4 5.5 7v21h21V7L21 4l-5 7-5-7Z" />
      <path d="M11 4l5 7 5-7" />
      <path d="M16 11v17" opacity=".5" />
      <path d="M20 17h3.5" />
    </svg>
  );
}

export function BadgeIcon({ className = "h-7 w-7" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={`${base} ${className}`} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3.5 19 8l5.3.4-3.4 4 1.2 5.2L16 15.4l-6.1 2.2 1.2-5.2-3.4-4L13 8l3-4.5Z" />
      <path d="M11.5 17.5 9.5 28l6.5-3.2 6.5 3.2-2-10.5" />
    </svg>
  );
}

export function ClockIcon({ className = "h-7 w-7" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={`${base} ${className}`} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="16" cy="16" r="12" />
      <path d="M16 9v7.5l5 3" />
    </svg>
  );
}

export const ICONS: Record<string, (p: P) => React.ReactElement> = {
  shirt: ShirtIcon, dress: DressIcon, linen: LinenIcon,
  suit: SuitIcon, badge: BadgeIcon, clock: ClockIcon,
};

export function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? ShirtIcon;
  return <C className={className} />;
}

export function ArrowIcon({ className = "h-4 w-4" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Un triangle de lecture, au trait, comme la flèche. */
export function PlayIcon({ className = "h-3.5 w-3.5" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5L8 5.5z" />
    </svg>
  );
}

export function CheckIcon({ className = "h-4 w-4" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

export function GoogleIcon({ className = "h-5 w-5" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.7-.2-2.5H12v4.7h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6v-3.1h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
    </svg>
  );
}
