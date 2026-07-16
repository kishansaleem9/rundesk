import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { LogoWordmark } from '@rundesk/ui'
import { ArrowLeft, Info } from 'lucide-react'

// Cross-links shown at the foot of every legal / trust page. Plain anchors keep
// these consistent with the marketing footer (which also links `/status` etc.).
const LEGAL_NAV: Array<{ href: string; label: string }> = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/dpa', label: 'Data Processing Addendum' },
  { href: '/trust', label: 'Trust & Security' },
]

/**
 * Shared chrome for the public legal / trust pages: sticky header with the
 * wordmark + a back-home link, a titled prose column, and a legal cross-nav.
 * The long-form body is intentionally English-only (legal copy is conventionally
 * single-language); short shared UI labels elsewhere remain fully localized.
 */
export function LegalPageShell({
  title,
  updated,
  lead,
  templateNotice = true,
  children,
}: {
  title: string
  updated?: string
  lead?: ReactNode
  templateNotice?: boolean
  children: ReactNode
}) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="Rundesk home" className="shrink-0">
            <LogoWordmark gradient />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {updated ? <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p> : null}
        {lead ? <p className="mt-6 text-base leading-relaxed text-muted-foreground">{lead}</p> : null}

        {templateNotice ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/40 p-3.5 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <p>
              This document is a good-faith template prepared for Rundesk. It is provided as a starting point
              and does not constitute legal advice; review it with qualified counsel before relying on it.
            </p>
          </div>
        ) : null}

        <div className="mt-10 space-y-9">{children}</div>

        <nav
          aria-label="Legal"
          className="mt-16 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/40 pt-6 text-sm"
        >
          {LEGAL_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </main>
    </div>
  )
}

/** A titled section of legal / trust prose. Styles nested links + lists uniformly. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">{heading}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_li]:marker:text-muted-foreground/60 [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  )
}

/** Consistent bulleted list for legal / trust content. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
