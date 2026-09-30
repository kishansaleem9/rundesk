import { PUBLIC_ROUTE_LIMITS, type RateLimitOptions } from './rate-limit.guard'

/**
 * WHAT MAKING AN ACCOUNT, ANSWERING AN INVITATION AND SIGNING IN THROUGH SSO,
 * GOOGLE OR MICROSOFT MAY ASK, PER ADDRESS (`found-30-sep/register-unthrottled`,
 * `found-30-sep/oauth-routes-unthrottled`).
 *
 * Each of these answers anybody, with no session, and the key such a request
 * has is its address (`req.ip`, which behind nginx is the visitor's only as
 * `TRUST_PROXY` has it, `common/http/trust-proxy.ts`). Read by
 * `RateLimitGuard`, which counts per route, address and minute and answers
 * 429 with a Retry-After past the budget.
 *
 * ClickUp documents limits for its API alone, per token (100 a minute on
 * Free Forever, Unlimited and Business, and a 429 past it); its help centre
 * says nothing of limits on signing up, on invitations or on SSO. So the safe
 * rule, as for the public routes: far above what one person asks, far below a
 * flood, and no route that makes an account without one.
 */
export const AUTH_ROUTE_LIMITS = {
  /**
   * Making an account, and answering an invitation. Sign-up's own ten a minute
   * (`POST /auth/signup` has had it since it was made), now also:
   *  - `POST /invitations/claim`, which makes the invitee's account (or signs
   *    an existing one in) and hands back a session;
   *  - `POST /invitations/decline`, the claim's other answer.
   * One person does each once. An office accepting its invitations together
   * behind one address shares the ten, as it shares sign-in's.
   *
   * `POST /auth/signup` is the one route that makes an account with no
   * invitation. The old `POST /auth/register` made one too, on a counter of
   * its own, so an address made ten a minute through each; it is retired and
   * answers 410 (`found-30-sep/register-counted-apart-from-signup`).
   */
  signUp: { limit: 10, windowMs: 60_000 },
  /**
   * Opening an invitation's link: `GET /invitations/preview`, which the
   * invitation page asks once as it opens. A page anybody holding the link
   * may open, so a page's budget, the public routes' own (120 a minute,
   * `PUBLIC_ROUTE_LIMITS.page`). The token is 256 random bits; guessing is not
   * the risk, a flood is.
   */
  invitationLink: PUBLIC_ROUTE_LIMITS.page,
  /**
   * `GET /auth/sso/lookup`: whether an email's domain signs in through SSO,
   * and which workspace's connection it is. The sign-in page asks it while
   * the email is typed (350 ms after each pause), so a person may ask several
   * times in one sign-in: six for each of sign-in's ten is 60. It also names
   * a workspace for a domain, so a flood is an enumeration of the instance's
   * SSO customers, which this bounds.
   */
  ssoLookup: { limit: 60, windowMs: 60_000 },
  /**
   * The redirects of an SSO sign-in: `GET /auth/sso/:provider/start`, and the
   * identity provider's answer coming back, `GET /auth/sso/oidc/callback` and
   * `POST /auth/sso/saml/callback`. One of each per sign-in. No password is
   * guessed through them, so three times sign-in's ten; but a start fetches
   * the provider's discovery document and writes a login state, an OIDC
   * callback exchanges a code with the provider, and a SAML callback checks
   * the signed answer against every enabled SAML connection, so a flood costs
   * the provider and this server.
   */
  ssoRedirect: { limit: 30, windowMs: 60_000 },
  /**
   * The redirects of signing in with Google or Microsoft, and of connecting an
   * integration (`found-30-sep/oauth-routes-unthrottled`): the start,
   * `GET /auth/oauth/:provider`, the provider's answer coming back,
   * `GET /auth/oauth/:provider/callback`, and a connection's answer,
   * `GET /integrations/oauth/:provider/callback`. SSO's thirty, for SSO's
   * reasons: one of each per sign-in or connection, no password guessed
   * through them, but a callback with a live state exchanges its code with the
   * provider (a flood spends the instance's standing with Google and
   * Microsoft) and writes an account, a link or a failure.
   *
   * `GET /auth/oauth/providers` is not here, and has no limit: it reads two
   * settings and touches nothing, so the limiter's counter, a write per
   * request, would cost more than the answer. The login page asks it once per
   * load, and CI's "Start the API" step polls it once a second, for up to a
   * minute, as its readiness probe — the health checks are unlimited for the
   * same reason (`PUBLIC_ROUTE_LIMITS`).
   */
  oauthRedirect: { limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitOptions>
