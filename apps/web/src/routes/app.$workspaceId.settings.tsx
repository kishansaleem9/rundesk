import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/app/$workspaceId/settings')({
  beforeLoad: ({ params }) => {
    const workspaceId = (params as any)?.workspaceId as string | undefined
    const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      workspaceId ?? '',
    )
    if (!ok) {
      throw redirect({ to: '/app/profile' })
    }
  },
})
