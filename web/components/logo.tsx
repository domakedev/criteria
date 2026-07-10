// Marca de criteria: el camino que se bifurca. Un solo componente para que
// landing, login y app se vean como el mismo producto.
import Link from "next/link";

export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#047857" />
      <path
        d="M32 52V33M32 33c0-8-6.5-12.5-14.5-14M32 33c0-8 6.5-12.5 14.5-14"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="17.5" cy="16.5" r="4.5" fill="#a7f3d0" />
      <circle cx="46.5" cy="16.5" r="4.5" fill="#fff" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <LogoMark />
      <span className="text-lg font-bold tracking-tight text-emerald-950">
        criteria
      </span>
    </Link>
  );
}
