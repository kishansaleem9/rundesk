import { useState } from 'react'
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
  ShieldCheck,
  Star,
  Quote,
} from 'lucide-react'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { LanguageSwitcher } from '../components/language-switcher'

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
  const { t } = useTranslation()
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

      <DemoModal t={t} open={demoOpen} onOpenChange={setDemoOpen} />
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
        <a href="#top" aria-label="Rundesk" className="shrink-0">
          <LogoWordmark gradient />
        </a>
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
            aria-label={t('landing.demoWatch')}
          >
            <span className="flex flex-col items-center gap-3">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow transition-transform group-hover:scale-110">
                <Play className="h-7 w-7 ltr:ml-1" />
              </span>
              <span className="text-sm font-medium text-muted-foreground">{t('landing.demoPlaceholder')}</span>
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}

function DemoModal({ t, open, onOpenChange }: { t: T; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('landing.demoModalTitle')}</DialogTitle>
          <DialogDescription>{t('landing.demoModalBody')}</DialogDescription>
        </DialogHeader>
        <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-border/50 bg-muted/30">
          <span className="flex flex-col items-center gap-3 text-muted-foreground">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow">
              <Play className="h-6 w-6 ltr:ml-1" />
            </span>
            <span className="text-sm">{t('landing.demoPlaceholder')}</span>
          </span>
        </div>
        <Button variant="gradient" asChild className="w-full">
          <Link to="/sign-up">
            {t('landing.demoModalCta')}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
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
    { labelKey: 'landing.footerPrivacy', href: '#' },
    { labelKey: 'landing.footerTerms', href: '#' },
    { labelKey: 'landing.footerSecurity', href: '#' },
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
