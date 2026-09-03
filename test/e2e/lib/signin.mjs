/**
 * Signing in, when the product is entitled to say "not so fast".
 *
 * `/auth/login` allows 10 requests a minute per IP, enforced across replicas by
 * a shared Postgres counter (`apps/api/src/common/guards/rate-limit.guard.ts`,
 * keyed `routeKey:clientIp:windowIndex`). That is the right thing for a login
 * route to do, and none of it should be relaxed to make tests pass.
 *
 * But in CI every suite is the same IP, and a browser suite spends at least two
 * of that budget on itself: one POST for its API token, and one more when it
 * drives the login form. Four quick suites back to back is eleven requests, and
 * the eleventh is a 429.
 *
 * Which is exactly how it presented. Nineteen suites passed and the three that
 * happen to run LAST all died with `login failed: 429` — reading as "the newly
 * added suites are broken", and being nothing of the kind. Whichever suites are
 * running when the window fills are the ones that starve, so adding a suite
 * anywhere just moves the casualty. The order made a shared, latent problem
 * look like a local, new one.
 *
 * The server already answers the question a client in this position needs to
 * ask — "when may I come back?", as the `Retry-After` header and again as
 * `error.details.retryAfter` — so this waits exactly that long rather than
 * guessing at a sleep. A fixed sleep has cost this branch two CI runs already;
 * this is the opposite, a wait the server dictates.
 *
 * Only 429 is retried. A wrong password fails on the first attempt, because
 * every suite here signs in with fixture credentials: those are either correct
 * or they are a bug worth seeing immediately, and a harness that retries a real
 * credential failure only turns a clear error into a slow one.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * How long to wait before trying again.
 *
 * The window is a minute wide, so a legitimate `Retry-After` never exceeds 60;
 * anything larger is a value we do not understand and should not obey for
 * minutes on end. The extra second is deliberate — the boundary is computed
 * from the server's clock, and arriving exactly on it lands in the old window.
 */
export function retryAfterMs(headerValue, bodyValue) {
  const seconds = Number(headerValue ?? bodyValue)
  const usable = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) : 5
  return (usable + 1) * 1000
}

/** True when a response is the rate limiter talking, rather than a bad password. */
const isRateLimited = (status) => status === 429

/**
 * Sign in over HTTP and return the login payload (`accessToken`, `user`,
 * `workspaces`, …) — the same shape the suites already destructure.
 */
export async function signInApi(base, email, password, { attempts = 4 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const body = await res.json().catch(() => null)
    if (body?.data?.accessToken) return body.data

    if (!isRateLimited(res.status)) {
      throw new Error(`could not sign in as ${email}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`)
    }
    if (attempt >= attempts) {
      throw new Error(
        `could not sign in as ${email}: rate limited ${attempts} times running. ` +
          'The suites ahead of this one are using more than 10 logins a minute between them.',
      )
    }
    await sleep(retryAfterMs(res.headers.get('retry-after'), body?.error?.details?.retryAfter))
  }
}

/*
 * There is deliberately no `signInUi` here.
 *
 * The suites sign in through the form twenty-odd times, and those POSTs need
 * the same protection — but they already share a choke point: every suite's
 * browser reaches the API through the proxy in `local-stack.mjs`, so the retry
 * lives there instead. One mechanism, no call sites to update, and nothing for
 * the next suite to remember. A second helper here would be a thing that looks
 * joined up and is not.
 */
