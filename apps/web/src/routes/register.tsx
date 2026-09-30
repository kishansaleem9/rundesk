import { createFileRoute, redirect } from '@tanstack/react-router'

/*
 * `/register` IS SIGN-UP (`found-30-sep/register-counted-apart-from-signup`).
 *
 * It was a page of its own, linked from nowhere, that made an account through
 * the old `POST /auth/register`: a second way to make one, on a counter of its
 * own beside sign-up's ten a minute. The route is retired (it answers 410), so
 * an old link or a typed address lands where the landing and login pages send
 * people, before anything of this page loads.
 */
export const Route = createFileRoute('/register')({
  beforeLoad: () => {
    throw redirect({ to: '/sign-up', replace: true })
  },
})
