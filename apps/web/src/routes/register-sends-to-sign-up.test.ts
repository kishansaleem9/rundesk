import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { isRedirect } from '@tanstack/react-router'
import { Route } from './register'

/**
 * `/register` IS SIGN-UP (`found-30-sep/register-counted-apart-from-signup`).
 *
 * The page made accounts through `POST /auth/register`, a second way to make
 * one with a counter of its own. The API route is retired and answers 410
 * (`auth-route-limits.mjs` reads it on a lane); an old link or a typed address
 * lands on the one sign-up the landing and login pages send people to.
 */
const ROUTES = dirname(fileURLToPath(import.meta.url))

describe('/register sends to /sign-up', () => {
  it('opening /register is redirected to /sign-up, in place, before anything of a page loads', () => {
    const beforeLoad = (Route.options as { beforeLoad?: (ctx: unknown) => unknown }).beforeLoad
    assert.equal(typeof beforeLoad, 'function', '/register has no beforeLoad, so it would draw a page')
    let thrown: unknown
    try {
      beforeLoad?.({})
    } catch (err) {
      thrown = err
    }
    assert.ok(isRedirect(thrown), `/register threw ${String(thrown)}, not a redirect`)
    const options = (thrown as { options: { to?: string; replace?: boolean } }).options
    assert.equal(options.to, '/sign-up')
    assert.equal(options.replace, true, 'the old address stays in the history, so Back returns to it')
  })

  it('and has no page of its own to draw', () => {
    assert.equal(existsSync(join(ROUTES, 'register.lazy.tsx')), false, 'routes/register.lazy.tsx is back')
    assert.equal(existsSync(join(ROUTES, '..', 'pages', 'register-page.tsx')), false, 'pages/register-page.tsx is back')
  })
})
