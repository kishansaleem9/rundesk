import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
} from '@rundesk/ui'
import {
  CheckCircle2,
  UserPlus,
  Target,
  Command,
  Mail,
  LifeBuoy,
  BookOpen,
} from 'lucide-react'
import { useTranslation } from '../lib/i18n'

const SUPPORT_EMAIL = 'support@theaura.agency'

export function HelpPage() {
  const { t } = useTranslation()

  const faqs = [
    {
      icon: CheckCircle2,
      question: t('help.q1'),
      answer: (
        <>
          {t('help.a1Pre')}{' '}
          <span className="font-medium text-foreground">{t('help.a1New')}</span>{' '}
          {t('help.a1Mid1')}{' '}
          <span className="font-medium text-foreground">{t('help.a1Task')}</span>
          {t('help.a1Mid2')}{' '}
          <Kbd>⌘K</Kbd>{t('help.a1Mid3')}{' '}
          <Kbd>↵</Kbd> {t('help.a1Post')}
        </>
      ),
    },
    {
      icon: UserPlus,
      question: t('help.q2'),
      answer: (
        <>
          {t('help.a2Pre')}{' '}
          <span className="font-medium text-foreground">{t('help.a2Settings')}</span>{' '}
          {t('help.a2Mid1')}{' '}
          <span className="font-medium text-foreground">{t('help.a2Members')}</span>{' '}
          {t('help.a2Post')}
        </>
      ),
    },
    {
      icon: Target,
      question: t('help.q3'),
      answer: (
        <>
          {t('help.a3Pre')}{' '}
          <span className="font-medium text-foreground">{t('help.a3Sprints')}</span>{' '}
          {t('help.a3Post')}
        </>
      ),
    },
    {
      icon: Command,
      question: t('help.q4'),
      answer: (
        <>
          {t('help.a4Pre')} <Kbd>⌘K</Kbd> {t('help.a4Mid1')} <Kbd>Ctrl K</Kbd>{' '}
          {t('help.a4Post')}
        </>
      ),
    },
  ]

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">
          {t('help.eyebrow')}
        </div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {t('help.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('help.subtitle')}
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-lg font-semibold text-foreground">
                {t('help.faqHeading')}
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {faqs.map((faq) => (
                <Card key={faq.question}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <faq.icon className="h-4 w-4 text-accent shrink-0" />
                      {faq.question}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LifeBuoy className="h-4 w-4 text-accent" />
                  {t('help.contactTitle')}
                </CardTitle>
                <CardDescription>
                  {t('help.contactDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t('help.contactBody')}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button asChild>
                    <a href={`mailto:${SUPPORT_EMAIL}`}>
                      <Mail className="h-4 w-4" />
                      {t('help.emailSupport')}
                    </a>
                  </Button>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-muted/40 border border-border/40 rounded text-muted-foreground">
      {children}
    </kbd>
  )
}
