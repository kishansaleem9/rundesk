import { useState, useEffect, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Button,
  Badge,
  LogoWordmark,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  cn,
} from '@rundesk/ui'
import {
  ListChecks,
  MessageCircle,
  Sparkles,
  Timer,
  BarChart3,
  PlugZap,
  FileText,
  ArrowRight,
  Check,
  Minus,
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  GitBranch,
  Bot,
  ShieldCheck,
  Star,
  Quote,
} from 'lucide-react'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { LanguageSwitcher } from '../components/language-switcher'
import { CustomDomainBrandMark } from '../components/custom-domain-mark'

// ---------------------------------------------------------------------------
// Static, translation-keyed content. Each entry references catalog keys so the
// whole page is localized (en/es/ar/ur) and reads correctly in RTL.
// ---------------------------------------------------------------------------

type FeatureDef = { icon: typeof ListChecks; titleKey: TranslationKey; descKey: TranslationKey }

const FEATURES: FeatureDef[] = [
  { icon: ListChecks, titleKey: 'landing.featTasksTitle', descKey: 'landing.featTasksDesc' },
  { icon: MessageCircle, titleKey: 'landing.featChatTitle', descKey: 'landing.featChatDesc' },
  { icon: Sparkles, titleKey: 'landing.featAiTitle', descKey: 'landing.featAiDesc' },
  { icon: Timer, titleKey: 'landing.featTimeTitle', descKey: 'landing.featTimeDesc' },
  { icon: BarChart3, titleKey: 'landing.featReportingTitle', descKey: 'landing.featReportingDesc' },
  { icon: PlugZap, titleKey: 'landing.featIntegrationsTitle', descKey: 'landing.featIntegrationsDesc' },
  { icon: FileText, titleKey: 'landing.featDocsTitle', descKey: 'landing.featDocsDesc' },
]

type PlanDef = {
  nameKey: TranslationKey
  priceKey: TranslationKey
  taglineKey: TranslationKey
  featureKeys: TranslationKey[]
  ctaKey: TranslationKey
  ctaTo: '/sign-up' | '/login'
  highlighted?: boolean
  customPrice?: boolean
}

const PLANS: PlanDef[] = [
  {
    nameKey: 'landing.planFreeName',
    priceKey: 'landing.planFreePrice',
    taglineKey: 'landing.planFreeTagline',
    featureKeys: ['landing.planFreeF1', 'landing.planFreeF2', 'landing.planFreeF3', 'landing.planFreeF4'],
    ctaKey: 'landing.pricingCtaFree',
    ctaTo: '/sign-up',
  },
  {
    nameKey: 'landing.planProName',
    priceKey: 'landing.planProPrice',
    taglineKey: 'landing.planProTagline',
    featureKeys: ['landing.planProF1', 'landing.planProF2', 'landing.planProF3', 'landing.planProF4'],
    ctaKey: 'landing.pricingCtaPaid',
    ctaTo: '/sign-up',
    highlighted: true,
  },
  {
    nameKey: 'landing.planBusinessName',
    priceKey: 'landing.planBusinessPrice',
    taglineKey: 'landing.planBusinessTagline',
    featureKeys: ['landing.planBusinessF1', 'landing.planBusinessF2', 'landing.planBusinessF3', 'landing.planBusinessF4'],
    ctaKey: 'landing.pricingCtaPaid',
    ctaTo: '/sign-up',
  },
  {
    nameKey: 'landing.planEnterpriseName',
    priceKey: 'landing.planEnterprisePrice',
    taglineKey: 'landing.planEnterpriseTagline',
    featureKeys: ['landing.planEnterpriseF1', 'landing.planEnterpriseF2', 'landing.planEnterpriseF3', 'landing.planEnterpriseF4'],
    ctaKey: 'landing.pricingCtaEnterprise',
    ctaTo: '/login',
    customPrice: true,
  },
]

type CmpCell = 'yes' | 'partial' | 'no'
type CmpRow = { labelKey: TranslationKey; rundesk: CmpCell; clickup: CmpCell; asana: CmpCell }

// Honest, product-accurate comparison. Values reflect generally available
// features; "partial" = add-on / limited / higher-tier-only.
const COMPARISON: CmpRow[] = [
  { labelKey: 'landing.cmpTasksViews', rundesk: 'yes', clickup: 'yes', asana: 'yes' },
  { labelKey: 'landing.cmpChat', rundesk: 'yes', clickup: 'yes', asana: 'no' },
  { labelKey: 'landing.cmpAi', rundesk: 'yes', clickup: 'yes', asana: 'partial' },
  { labelKey: 'landing.cmpDocs', rundesk: 'yes', clickup: 'yes', asana: 'no' },
  { labelKey: 'landing.cmpTime', rundesk: 'yes', clickup: 'yes', asana: 'partial' },
  { labelKey: 'landing.cmpGoals', rundesk: 'yes', clickup: 'yes', asana: 'partial' },
  { labelKey: 'landing.cmpReporting', rundesk: 'yes', clickup: 'yes', asana: 'yes' },
  { labelKey: 'landing.cmpIntegrations', rundesk: 'yes', clickup: 'yes', asana: 'yes' },
]

type TestimonialDef = { quoteKey: TranslationKey; roleKey: TranslationKey }

const TESTIMONIALS: TestimonialDef[] = [
  { quoteKey: 'landing.testi1Quote', roleKey: 'landing.testi1Role' },
  { quoteKey: 'landing.testi2Quote', roleKey: 'landing.testi2Role' },
  { quoteKey: 'landing.testi3Quote', roleKey: 'landing.testi3Role' },
]

// ---------------------------------------------------------------------------

export function LandingPage() {
  const { t, dir } = useTranslation()
  const [demoOpen, setDemoOpen] = useState(false)
  const year = new Date().getFullYear()

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="bg-aurora pointer-events-none fixed inset-0" />
      <div className="bg-grid-dim pointer-events-none fixed inset-0 opacity-30" />

      <div className="relative z-10">
        <SiteHeader t={t} />
        <main>
          <Hero t={t} onWatchDemo={() => setDemoOpen(true)} />
          <Features t={t} />
          <Pricing t={t} />
          <Comparison t={t} />
          <DemoSection t={t} onWatchDemo={() => setDemoOpen(true)} />
          <Testimonials t={t} />
          <FinalCta t={t} />
        </main>
        <SiteFooter t={t} year={year} />
      </div>

      <DemoModal t={t} dir={dir} open={demoOpen} onOpenChange={setDemoOpen} />
    </div>
  )
}

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function SiteHeader({ t }: { t: T }) {
  const navItems: Array<{ href: string; labelKey: TranslationKey }> = [
    { href: '#features', labelKey: 'landing.navFeatures' },
    { href: '#pricing', labelKey: 'landing.navPricing' },
    { href: '#compare', labelKey: 'landing.navCompare' },
    { href: '#testimonials', labelKey: 'landing.navTestimonials' },
  ]
  return (
    <header className="sticky top-0 z-20 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a href="#top" aria-label="Rundesk" className="shrink-0">
            <LogoWordmark gradient />
          </a>
          {/* Co-branding when served from a verified custom domain */}
          <CustomDomainBrandMark compact className="border-l border-border/50 pl-3" />
        </div>
        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t(item.labelKey)}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/login">{t('landing.signIn')}</Link>
          </Button>
          <Button variant="gradient" size="sm" asChild>
            <Link to="/sign-up">
              {t('landing.getStarted')}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function Hero({ t, onWatchDemo }: { t: T; onWatchDemo: () => void }) {
  return (
    <section id="top" className="mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
      <Badge variant="soft" className="mb-6 inline-flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" />
        {t('landing.heroBadge')}
      </Badge>
      <h1 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
        {t('landing.heroTitleLead')}{' '}
        <span className="text-brand-gradient">{t('landing.heroTitleAccent')}</span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        {t('landing.heroSubtitle')}
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button variant="gradient" size="lg" asChild className="w-full sm:w-auto">
          <Link to="/sign-up">
            {t('landing.heroCtaPrimary')}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
        <Button variant="glass" size="lg" onClick={onWatchDemo} className="w-full sm:w-auto">
          <Play className="h-4 w-4" />
          {t('landing.heroCtaSecondary')}
        </Button>
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        {t('landing.heroNote')}
      </p>

      {/* Stylized product preview placeholder — a self-contained mock, no asset. */}
      <div className="card-glass mx-auto mt-14 max-w-4xl overflow-hidden p-2 shadow-glow">
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </div>
        <div className="grid grid-cols-[140px_1fr] gap-3 rounded-xl border border-border/40 bg-card/40 p-3 text-left sm:grid-cols-[180px_1fr]">
          <div className="hidden flex-col gap-2 sm:flex">
            {['landing.navFeatures', 'landing.featChatTitle', 'landing.featDocsTitle', 'landing.featAiTitle', 'landing.featReportingTitle'].map(
              (k, i) => (
                <div
                  key={k}
                  className={cn(
                    'h-7 rounded-md px-2 text-xs leading-7',
                    i === 0 ? 'bg-brand-gradient text-white' : 'bg-muted/40 text-muted-foreground',
                  )}
                >
                  {t(k as TranslationKey)}
                </div>
              ),
            )}
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-center gap-3 rounded-md border border-border/30 bg-background/40 px-3 py-2.5">
                <span className={cn('h-3 w-3 shrink-0 rounded-full', row % 3 === 0 ? 'bg-emerald-500' : row % 3 === 1 ? 'bg-amber-500' : 'bg-brand-500')} />
                <span className="h-2.5 flex-1 rounded bg-muted/60" style={{ maxWidth: `${70 - row * 8}%` }} />
                <span className="h-5 w-5 rounded-full bg-brand-gradient/70" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
function Features({ t }: { t: T }) {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading title={t('landing.featuresTitle')} subtitle={t('landing.featuresSubtitle')} />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => {
          const Icon = f.icon
          return (
            <div
              key={f.titleKey}
              className="card-glass group flex flex-col gap-3 p-6 transition-all hover:border-accent/40"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-lg font-semibold">{t(f.titleKey)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(f.descKey)}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------
function Pricing({ t }: { t: T }) {
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading title={t('landing.pricingTitle')} subtitle={t('landing.pricingSubtitle')} />
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <div
            key={plan.nameKey}
            className={cn(
              'card-glass relative flex flex-col p-6',
              plan.highlighted && 'border-accent/60 shadow-glow',
            )}
          >
            {plan.highlighted && (
              <Badge variant="gradient" className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                {t('landing.pricingMostPopular')}
              </Badge>
            )}
            <h3 className="font-display text-lg font-semibold">{t(plan.nameKey)}</h3>
            <p className="mt-1 min-h-[2.5rem] text-sm text-muted-foreground">{t(plan.taglineKey)}</p>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-semibold tracking-tight">{t(plan.priceKey)}</span>
              {!plan.customPrice && (
                <span className="text-xs text-muted-foreground">{t('landing.pricingPerUser')}</span>
              )}
            </div>
            <Button
              variant={plan.highlighted ? 'gradient' : 'outline'}
              className="mt-5 w-full"
              asChild
            >
              <Link to={plan.ctaTo}>{t(plan.ctaKey)}</Link>
            </Button>
            <ul className="mt-6 space-y-2.5">
              {plan.featureKeys.map((fk) => (
                <li key={fk} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="text-muted-foreground">{t(fk)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
function CmpMark({ value }: { value: CmpCell }) {
  if (value === 'yes') return <Check className="mx-auto h-5 w-5 text-emerald-500" aria-hidden />
  if (value === 'partial') return <Minus className="mx-auto h-5 w-5 text-amber-500" aria-hidden />
  return <X className="mx-auto h-5 w-5 text-muted-foreground/50" aria-hidden />
}

function Comparison({ t }: { t: T }) {
  const cmpLabel = (v: CmpCell) =>
    v === 'yes' ? t('landing.cmpIncluded') : v === 'partial' ? t('landing.cmpAddon') : t('landing.cmpNone')
  return (
    <section id="compare" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading title={t('landing.compareTitle')} subtitle={t('landing.compareSubtitle')} />
      <div className="card-glass mt-12 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="p-4 text-start font-medium text-muted-foreground">{t('landing.compareColFeature')}</th>
              <th className="p-4 text-center">
                <span className="text-brand-gradient font-semibold">{t('landing.compareColRundesk')}</span>
              </th>
              <th className="p-4 text-center font-medium text-muted-foreground">{t('landing.compareColClickup')}</th>
              <th className="p-4 text-center font-medium text-muted-foreground">{t('landing.compareColAsana')}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.labelKey} className="border-b border-border/30 last:border-0">
                <td className="p-4 text-start font-medium">{t(row.labelKey)}</td>
                <td className="bg-accent/5 p-4">
                  <CmpMark value={row.rundesk} />
                  <span className="sr-only">{cmpLabel(row.rundesk)}</span>
                </td>
                <td className="p-4">
                  <CmpMark value={row.clickup} />
                  <span className="sr-only">{cmpLabel(row.clickup)}</span>
                </td>
                <td className="p-4">
                  <CmpMark value={row.asana} />
                  <span className="sr-only">{cmpLabel(row.asana)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Check className="h-4 w-4 text-emerald-500" /> {t('landing.cmpIncluded')}
        </span>
        <span className="flex items-center gap-1.5">
          <Minus className="h-4 w-4 text-amber-500" /> {t('landing.cmpAddon')}
        </span>
        <span className="flex items-center gap-1.5">
          <X className="h-4 w-4 text-muted-foreground/50" /> {t('landing.cmpNone')}
        </span>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground/70">{t('landing.compareNote')}</p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Demo section + modal
// ---------------------------------------------------------------------------
function DemoSection({ t, onWatchDemo }: { t: T; onWatchDemo: () => void }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
      <div className="card-glass relative overflow-hidden p-8 text-center sm:p-14">
        <div className="bg-brand-gradient-soft pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{t('landing.demoTitle')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">{t('landing.demoSubtitle')}</p>
          <button
            type="button"
            onClick={onWatchDemo}
            className="group mx-auto mt-8 flex aspect-video w-full max-w-2xl items-center justify-center rounded-2xl border border-border/50 bg-background/40 transition-all hover:border-accent/50"
            aria-label={t('tour.open')}
          >
            <span className="flex flex-col items-center gap-3">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow transition-transform group-hover:scale-110">
                <Play className="h-7 w-7 ltr:ml-1" />
              </span>
              <span className="text-sm font-medium text-muted-foreground">{t('tour.launch')}</span>
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Interactive product tour (§14.3) — replaces the old "demo video" placeholder
// with a genuine, self-contained walkthrough of real Rundesk features. Every
// visual is built from divs/SVG using the existing design tokens (no assets).
// ---------------------------------------------------------------------------

/** Tracks the user's `prefers-reduced-motion` setting (SSR-safe). */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

type TourStep = {
  id: string
  icon: typeof ListChecks
  titleKey: TranslationKey
  descKey: TranslationKey
  render: (t: T) => ReactNode
}

// ── Feature mocks — lightweight, on-brand visuals ───────────────────────────

/** Board (Kanban) — three columns of task cards. */
function BoardMock({ t }: { t: T }) {
  const columns: Array<{
    key: string
    titleKey: TranslationKey
    count: number
    cards: Array<{ labelKey: TranslationKey; dot: string }>
  }> = [
    {
      key: 'todo',
      titleKey: 'tour.boardCol1',
      count: 4,
      cards: [
        { labelKey: 'tour.boardCard1', dot: 'bg-brand-500' },
        { labelKey: 'tour.boardCard2', dot: 'bg-violet' },
      ],
    },
    {
      key: 'doing',
      titleKey: 'tour.boardCol2',
      count: 2,
      cards: [{ labelKey: 'tour.boardCard3', dot: 'bg-amber' }],
    },
    {
      key: 'done',
      titleKey: 'tour.boardCol3',
      count: 6,
      cards: [{ labelKey: 'tour.boardCard4', dot: 'bg-mint' }],
    },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {columns.map((col) => (
        <div key={col.key} className="rounded-lg border border-border/40 bg-background/40 p-2">
          <div className="mb-2 flex items-center justify-between gap-1">
            <span className="truncate text-[11px] font-medium text-muted-foreground">{t(col.titleKey)}</span>
            <span className="shrink-0 rounded-full bg-muted/60 px-1.5 text-[10px] leading-4 tabular-nums text-muted-foreground">
              {col.count}
            </span>
          </div>
          <div className="space-y-1.5">
            {col.cards.map((card) => (
              <div key={card.labelKey} className="rounded-md border border-border/30 bg-card/70 p-2 shadow-sm">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', card.dot)} />
                  <span className="h-1.5 flex-1 rounded-full bg-muted/50" />
                </div>
                <span className="block text-[11px] font-medium leading-snug text-foreground/80">{t(card.labelKey)}</span>
                <div className="mt-2 flex items-center justify-between">
                  <span className="h-1.5 w-8 rounded-full bg-muted/40" />
                  <span className="h-4 w-4 rounded-full bg-brand-gradient" />
                </div>
              </div>
            ))}
            <div className="rounded-md border border-dashed border-border/40 py-1 text-center text-[11px] leading-none text-muted-foreground/50">
              +
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** AI assistant — a prompt bubble and a generated task breakdown. */
function AiMock({ t }: { t: T }) {
  const tasks: TranslationKey[] = ['tour.aiTask1', 'tour.aiTask2', 'tour.aiTask3']
  return (
    <div className="space-y-2.5">
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-brand-gradient px-3 py-2 text-[12px] leading-snug text-white shadow-sm">
          {t('tour.aiPrompt')}
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-gradient text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 rounded-2xl rounded-tl-sm border border-border/40 bg-background/50 p-2.5">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Sparkles className="h-3 w-3 text-violet" />
            {t('tour.aiReply')}
          </div>
          <ul className="space-y-1.5">
            {tasks.map((task) => (
              <li
                key={task}
                className="flex items-center gap-2 rounded-lg border border-border/30 bg-card/70 px-2 py-1.5"
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-[5px] bg-mint/20 text-mint">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-[11px] leading-snug text-foreground/80">{t(task)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/** Team chat — a channel header with two message bubbles. */
function ChatMock({ t }: { t: T }) {
  const initial1 = t('tour.chatName1').charAt(0)
  const initial2 = t('tour.chatName2').charAt(0)
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 border-b border-border/30 pb-2 text-[11px] font-semibold text-muted-foreground">
        <MessageCircle className="h-3.5 w-3.5 text-brand-500" />
        {t('tour.chatChannel')}
      </div>
      <div className="flex items-start gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet/20 text-[10px] font-semibold text-violet">
          {initial1}
        </span>
        <div className="min-w-0">
          <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">{t('tour.chatName1')}</div>
          <div className="rounded-2xl rounded-tl-sm border border-border/40 bg-background/50 px-3 py-1.5 text-[12px] leading-snug text-foreground/85">
            {t('tour.chatMsg1')}
          </div>
        </div>
      </div>
      <div className="flex flex-row-reverse items-start gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-gradient text-[10px] font-semibold text-white">
          {initial2}
        </span>
        <div className="flex min-w-0 flex-col items-end">
          <div className="mb-0.5 text-[10px] font-medium text-muted-foreground">{t('tour.chatName2')}</div>
          <div className="rounded-2xl rounded-tr-sm bg-brand-gradient px-3 py-1.5 text-[12px] leading-snug text-white">
            {t('tour.chatMsg2')}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 ltr:pl-8 rtl:pr-8" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
      </div>
    </div>
  )
}

/** Timeline / Gantt — labelled rows with offset bars and a "today" marker. */
function TimelineMock({ t }: { t: T }) {
  const cols = 12
  const rows: Array<{ key: string; labelKey: TranslationKey; start: number; span: number; cls: string }> = [
    { key: 'r1', labelKey: 'tour.timelineRow1', start: 0, span: 3, cls: 'bg-brand-500' },
    { key: 'r2', labelKey: 'tour.timelineRow2', start: 2, span: 4, cls: 'bg-violet' },
    { key: 'r3', labelKey: 'tour.timelineRow3', start: 4, span: 5, cls: 'bg-brand-gradient' },
    { key: 'r4', labelKey: 'tour.timelineRow4', start: 8, span: 3, cls: 'bg-mint' },
  ]
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[68px_1fr] items-center gap-2">
        <span />
        <div className="relative h-3">
          <span
            className="absolute top-0 -translate-x-1/2 rounded bg-brand-500/15 px-1.5 text-[9px] font-medium text-brand-500"
            style={{ insetInlineStart: '50%' }}
          >
            {t('tour.timelineNow')}
          </span>
        </div>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[68px_1fr] items-center gap-2">
          <span className="truncate text-[11px] font-medium text-muted-foreground">{t(row.labelKey)}</span>
          <div className="relative h-4 rounded bg-muted/25">
            <span className="absolute inset-y-0 w-px bg-brand-500/50" style={{ insetInlineStart: '50%' }} />
            <span
              className={cn('absolute inset-y-0.5 rounded-md', row.cls)}
              style={{ insetInlineStart: `${(row.start / cols) * 100}%`, width: `${(row.span / cols) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Dashboards & reports — stat tiles plus a mini bar chart. */
function ReportsMock({ t }: { t: T }) {
  const stats: Array<{ key: string; labelKey: TranslationKey; value: string }> = [
    { key: 's1', labelKey: 'tour.reportsStat1', value: '128' },
    { key: 's2', labelKey: 'tour.reportsStat2', value: '94%' },
    { key: 's3', labelKey: 'tour.reportsStat3', value: '+12%' },
  ]
  const bars = [40, 66, 52, 80, 61, 92, 74]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.key} className="rounded-lg border border-border/40 bg-background/40 p-2">
            <div className="font-display text-lg font-semibold leading-none tabular-nums text-foreground">{s.value}</div>
            <div className="mt-1 truncate text-[10px] text-muted-foreground">{t(s.labelKey)}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border/40 bg-background/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5 text-brand-500" />
          {t('tour.reportsChartTitle')}
        </div>
        <div className="flex h-20 items-end gap-1.5">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-brand-gradient" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Time tracking — a running timer and logged entries with a weekly total. */
function TimeMock({ t }: { t: T }) {
  const entries: Array<{ key: string; labelKey: TranslationKey; dur: string; cls: string }> = [
    { key: 'e1', labelKey: 'tour.timeEntry1', dur: '1:45', cls: 'bg-brand-500' },
    { key: 'e2', labelKey: 'tour.timeEntry2', dur: '0:30', cls: 'bg-violet' },
    { key: 'e3', labelKey: 'tour.timeEntry3', dur: '2:10', cls: 'bg-mint' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-background/40 p-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gradient text-white shadow-glow">
            <Timer className="h-4 w-4" />
          </span>
          <div>
            <div className="font-mono text-lg font-semibold leading-none tabular-nums text-foreground">02:14:08</div>
            <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-mint">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" />
              {t('tour.timeTracking')}
            </div>
          </div>
        </div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border/50 text-muted-foreground">
          <Pause className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="space-y-1.5">
        {entries.map((e) => (
          <div key={e.key} className="flex items-center gap-2 rounded-lg border border-border/30 bg-card/60 px-2.5 py-1.5">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', e.cls)} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">{t(e.labelKey)}</span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{e.dur}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[11px]">
        <span className="font-medium text-muted-foreground">{t('tour.timeTotal')}</span>
        <span className="font-mono font-semibold tabular-nums text-foreground">18:20</span>
      </div>
    </div>
  )
}

const TOUR_STEPS: TourStep[] = [
  { id: 'board', icon: LayoutGrid, titleKey: 'tour.boardTitle', descKey: 'tour.boardDesc', render: (t) => <BoardMock t={t} /> },
  { id: 'ai', icon: Bot, titleKey: 'tour.aiTitle', descKey: 'tour.aiDesc', render: (t) => <AiMock t={t} /> },
  { id: 'chat', icon: MessageCircle, titleKey: 'tour.chatTitle', descKey: 'tour.chatDesc', render: (t) => <ChatMock t={t} /> },
  { id: 'timeline', icon: GitBranch, titleKey: 'tour.timelineTitle', descKey: 'tour.timelineDesc', render: (t) => <TimelineMock t={t} /> },
  { id: 'reports', icon: BarChart3, titleKey: 'tour.reportsTitle', descKey: 'tour.reportsDesc', render: (t) => <ReportsMock t={t} /> },
  { id: 'time', icon: Timer, titleKey: 'tour.timeTitle', descKey: 'tour.timeDesc', render: (t) => <TimeMock t={t} /> },
]

const TOUR_AUTOPLAY_MS = 4500

function ProductTour({ t, dir, open }: { t: T; dir: 'ltr' | 'rtl'; open: boolean }) {
  const reduced = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const total = TOUR_STEPS.length

  // Reset to the first step (and stop auto-play) each time the modal opens.
  useEffect(() => {
    if (open) {
      setIndex(0)
      setPlaying(false)
    }
  }, [open])

  // Auto-advance — a cleaned-up interval, disabled for reduced-motion users.
  useEffect(() => {
    if (!open || !playing || reduced) return
    const id = setInterval(() => setIndex((i) => (i + 1) % total), TOUR_AUTOPLAY_MS)
    return () => clearInterval(id)
  }, [open, playing, reduced, total])

  // Keyboard: left/right arrows navigate (direction-aware). Escape is handled
  // by the Radix Dialog itself (closes the modal).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const forward = dir === 'rtl' ? e.key === 'ArrowLeft' : e.key === 'ArrowRight'
      setPlaying(false)
      setIndex((i) => (forward ? i + 1 : i - 1 + total) % total)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dir, total])

  const goTo = (i: number) => {
    setPlaying(false)
    setIndex((i + total) % total)
  }

  const step = TOUR_STEPS[index]
  const Icon = step.icon

  return (
    <div className="flex flex-col">
      <DialogHeader className="p-6 pb-3 pr-10">
        <Badge variant="soft" className="mb-1 inline-flex w-fit items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {t('tour.badge')}
        </Badge>
        <DialogTitle>{t('tour.modalTitle')}</DialogTitle>
        <DialogDescription>{t('tour.modalIntro')}</DialogDescription>
      </DialogHeader>

      <div className="px-6">
        <div className="mb-3 flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold leading-tight">{t(step.titleKey)}</h3>
            <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{t(step.descKey)}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border/40 bg-card/40 p-3">
          <div className="mb-2.5 flex items-center gap-1.5 px-0.5" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-red-400/60" />
            <span className="h-2 w-2 rounded-full bg-amber-400/60" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
          </div>
          <div key={index} className={cn('min-h-[204px]', !reduced && 'animate-fade-in')}>
            {step.render(t)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/50 px-6 py-3">
        <Button variant="outline" onClick={() => goTo(index - 1)} className="h-9 gap-1 px-2.5">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          <span className="hidden sm:inline">{t('tour.prev')}</span>
        </Button>

        <div className="flex items-center gap-1.5">
          {TOUR_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t('tour.goToStep', { title: t(s.titleKey) })}
              aria-current={i === index}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-6 bg-brand-gradient' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60',
              )}
            />
          ))}
        </div>

        <Button variant="outline" onClick={() => goTo(index + 1)} className="h-9 gap-1 px-2.5">
          <span className="hidden sm:inline">{t('tour.next')}</span>
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 px-6 pb-3">
        {reduced ? (
          <span aria-hidden />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPlaying((p) => !p)}
            aria-pressed={playing}
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? t('tour.pause') : t('tour.play')}
          </Button>
        )}
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('tour.stepCounter', { current: index + 1, total })}
        </span>
      </div>

      <div className="border-t border-border/50 p-4">
        <Button variant="gradient" asChild className="w-full">
          <Link to="/sign-up">
            {t('tour.cta')}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

function DemoModal({
  t,
  dir,
  open,
  onOpenChange,
}: {
  t: T
  dir: 'ltr' | 'rtl'
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl gap-0 overflow-y-auto p-0">
        <ProductTour t={t} dir={dir} open={open} />
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------
function Testimonials({ t }: { t: T }) {
  return (
    <section id="testimonials" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading title={t('landing.testimonialsTitle')} subtitle={t('landing.testimonialsSubtitle')} />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {TESTIMONIALS.map((item) => (
          <figure key={item.quoteKey} className="card-glass flex flex-col gap-4 p-6">
            <Quote className="h-6 w-6 text-accent/60" aria-hidden />
            <div className="flex gap-0.5" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <blockquote className="flex-1 text-sm leading-relaxed text-foreground/90">{t(item.quoteKey)}</blockquote>
            <figcaption className="text-xs font-medium text-muted-foreground">— {t(item.roleKey)}</figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-6 text-center text-xs italic text-muted-foreground/70">{t('landing.testimonialsDisclaimer')}</p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------
function FinalCta({ t }: { t: T }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
      <div className="card-glass relative overflow-hidden p-10 text-center shadow-glow sm:p-16">
        <div className="bg-brand-gradient pointer-events-none absolute inset-0 opacity-10" />
        <div className="relative">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t('landing.ctaTitle')}</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">{t('landing.ctaSubtitle')}</p>
          <Button variant="gradient" size="lg" asChild className="mt-8">
            <Link to="/sign-up">
              {t('landing.ctaButton')}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
function SiteFooter({ t, year }: { t: T; year: number }) {
  const productLinks: Array<{ labelKey: TranslationKey; href: string }> = [
    { labelKey: 'landing.navFeatures', href: '#features' },
    { labelKey: 'landing.navPricing', href: '#pricing' },
    { labelKey: 'landing.navCompare', href: '#compare' },
  ]
  const resourceLinks: Array<{ labelKey: TranslationKey; href: string }> = [
    { labelKey: 'landing.footerStatus', href: '/status' },
    { labelKey: 'landing.footerHelp', href: '#' },
    { labelKey: 'landing.footerContact', href: '#' },
  ]
  const legalLinks: Array<{ labelKey: TranslationKey; href: string }> = [
    { labelKey: 'landing.footerPrivacy', href: '/privacy' },
    { labelKey: 'landing.footerTerms', href: '/terms' },
    { labelKey: 'landing.footerDpa', href: '/dpa' },
    { labelKey: 'landing.footerSecurity', href: '/trust' },
  ]

  return (
    <footer className="border-t border-border/40 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <LogoWordmark gradient />
            <p className="max-w-xs text-sm text-muted-foreground">{t('landing.footerTagline')}</p>
          </div>
          <FooterColumn title={t('landing.footerProduct')} links={productLinks} t={t} />
          <FooterColumn title={t('landing.footerResources')} links={resourceLinks} t={t} />
          <FooterColumn title={t('landing.footerLegal')} links={legalLinks} t={t} />
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">{t('landing.footerRights', { year })}</p>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">{t('landing.signIn')}</Link>
            </Button>
            <Button variant="gradient" size="sm" asChild>
              <Link to="/sign-up">{t('landing.getStarted')}</Link>
            </Button>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
  t,
}: {
  title: string
  links: Array<{ labelKey: TranslationKey; href: string }>
  t: T
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.labelKey}>
            <a href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {t(link.labelKey)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-3 text-sm text-muted-foreground sm:text-base">{subtitle}</p>
    </div>
  )
}
