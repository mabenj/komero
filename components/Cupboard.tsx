import type { ReactNode } from "react";

const stroke = {
  stroke: "currentColor",
  // Screen pixels: every stroke is non-scaling (globals.css), so the squeezed doors match the body.
  strokeWidth: 5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * The app icon's cupboard with two shelves of jars. Its doors open once when it
 * appears (CSS in globals.css); under reduced motion they are already open.
 */
export function Cupboard({ className = "h-40 w-40" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" className={`cupboard text-foreground ${className}`} aria-hidden="true">
      <g fill="none" {...stroke}>
        <line x1="44" y1="78" x2="156" y2="78" />
        <line x1="44" y1="134" x2="156" y2="134" />
        <rect x="58" y="48" width="20" height="30" rx="5" fill="var(--accent)" fillOpacity="0.35" />
        <rect x="88" y="56" width="26" height="22" rx="5" fill="var(--accent)" fillOpacity="0.2" />
        <rect x="122" y="104" width="22" height="30" rx="6" fill="var(--accent)" fillOpacity="0.35" />
        <path d="M60 134v-18a8 8 0 0 1 16 0v18" fill="var(--accent)" fillOpacity="0.2" />
        <rect x="40" y="20" width="120" height="170" rx="12" />
        <line x1="62" y1="190" x2="62" y2="206" />
        <line x1="138" y1="190" x2="138" y2="206" />
      </g>
      <g className="cupboard-door cupboard-door-left" {...stroke}>
        <rect x="40" y="20" width="60" height="170" rx="12" fill="var(--background)" />
        <line x1="86" y1="96" x2="86" y2="120" />
      </g>
      <g className="cupboard-door cupboard-door-right" {...stroke}>
        <rect x="100" y="20" width="60" height="170" rx="12" fill="var(--background)" />
        <line x1="114" y1="96" x2="114" y2="120" />
      </g>
    </svg>
  );
}

/**
 * The cupboard over a heading and a short line, for empty screens and rare
 * moments such as "All put away!"; `children` go under the line.
 */
export function CupboardNote({
  title,
  hint,
  role,
  children,
}: {
  title: string;
  hint: string;
  role?: "status";
  children?: ReactNode;
}) {
  return (
    <div role={role} className="flex flex-col items-center gap-3 px-6 py-4 text-center">
      <Cupboard />
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="text-stone-600 dark:text-stone-400">{hint}</p>
      {children}
    </div>
  );
}
