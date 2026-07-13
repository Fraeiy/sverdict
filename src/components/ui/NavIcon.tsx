import type { ReactNode } from 'react'

type IconName = 'markets' | 'portfolio' | 'settings' | 'admin'

const PATHS: Record<IconName, ReactNode> = {
  markets: (
    <>
      <path d="M4 6h16v12H4z" strokeWidth="1.75" />
      <path d="M8 10h8M8 14h5" strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  portfolio: (
    <>
      <path d="M6 8h12v10H6z" strokeWidth="1.75" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M9 13h6" strokeWidth="1.75" strokeLinecap="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" strokeWidth="1.75" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </>
  ),
  admin: (
    <>
      <path d="M12 3l7 4v6c0 4.2-3 7.4-7 8-4-.6-7-3.8-7-8V7l7-4z" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
}

type Props = {
  name: IconName
  active?: boolean
  className?: string
}

export function NavIcon({ name, active = false, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
      className={`h-5 w-5 shrink-0 transition ${active ? 'text-[var(--color-gold)]' : 'text-[var(--color-muted)]'} ${className}`}
    >
      {PATHS[name]}
    </svg>
  )
}