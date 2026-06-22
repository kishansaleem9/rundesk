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

const SUPPORT_EMAIL = 'support@theaura.agency'

type Faq = {
  icon: React.ElementType
  question: string
  answer: React.ReactNode
}

const FAQS: Faq[] = [
  {
    icon: CheckCircle2,
    question: 'How do I create a task?',
    answer: (
      <>
        Hit the <span className="font-medium text-foreground">New</span> button in
        the top bar and choose <span className="font-medium text-foreground">Task</span>,
        or open a list and use the inline composer at the bottom of any group. You
        can also press <Kbd>⌘K</Kbd>, type a title, and press{' '}
        <Kbd>↵</Kbd> to create a task straight from the command palette.
      </>
    ),
  },
  {
    icon: UserPlus,
    question: 'How do I invite members?',
    answer: (
      <>
        Open <span className="font-medium text-foreground">Workspace settings</span>{' '}
        from your avatar menu, go to the{' '}
        <span className="font-medium text-foreground">Members</span> tab, and send
        an invite by email. Invitees receive a link to join your workspace with the
        role you pick.
      </>
    ),
  },
  {
    icon: Target,
    question: 'How do sprints work?',
    answer: (
      <>
        Sprints group tasks into time-boxed iterations. Open{' '}
        <span className="font-medium text-foreground">Sprints</span> in the sidebar
        to start a new sprint, set its start and end dates, then drag tasks in from
        your backlog. Progress and burndown update automatically as tasks move
        through their statuses.
      </>
    ),
  },
  {
    icon: Command,
    question: 'What keyboard shortcuts are there?',
    answer: (
      <>
        Press <Kbd>⌘K</Kbd> (or <Kbd>Ctrl K</Kbd> on Windows/Linux) anywhere to
        open the command palette — search across tasks, docs and people, jump to
        any page, or create a task on the fly. You can also start typing in the
        search box in the top bar to jump straight into it.
      </>
    ),
  },
]

export function HelpPage() {
  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">
          Support
        </div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Help &amp; support
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Answers to common questions, plus how to reach a human when you need one.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-lg font-semibold text-foreground">
                Frequently asked questions
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {FAQS.map((faq) => (
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
                  Contact support
                </CardTitle>
                <CardDescription>
                  Can&apos;t find what you need? Our team is happy to help.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Email us with as much detail as you can — what you were trying to
                  do, what you expected, and what happened instead. Screenshots and
                  the name of the workspace or task involved help us resolve things
                  faster. We typically reply within one business day.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button asChild>
                    <a href={`mailto:${SUPPORT_EMAIL}`}>
                      <Mail className="h-4 w-4" />
                      Email support
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
