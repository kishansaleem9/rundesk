import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    // An authenticated visitor to `/` still goes straight into the app (no
    // regression). An anonymous visitor falls through to the public marketing
    // landing page provided by the lazy route (index.lazy.tsx).
    if (context.auth.isAuthenticated()) {
      throw redirect({ to: '/app' })
    }
  },
})
