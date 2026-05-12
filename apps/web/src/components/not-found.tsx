import { Link } from '@tanstack/react-router'
import { Button, Card } from '@rundesk/ui'
import { Compass, Home } from 'lucide-react'

/**
 * Rendered by the root route's `notFoundComponent` whenever the router
 * can't resolve the requested URL. We keep it explicit (rather than
 * falling back to a blank page) so deep links from stale Slack messages,
 * old emails, or bookmark URLs after a route rename land somewhere
 * navigable instead of disappearing into a void.
 */
export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-lg w-full p-8 text-center bg-card/80 backdrop-blur">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-brand-100 text-accent flex items-center justify-center">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
          We couldn&rsquo;t find that page
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          The URL may have changed, or you may not have access. Try going home and navigating from there.
        </p>
        <Button asChild className="gap-2">
          <Link to="/">
            <Home className="h-4 w-4" />
            Go home
          </Link>
        </Button>
      </Card>
    </div>
  )
}
