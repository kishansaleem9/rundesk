/**
 * A GRANT'S START ANSWERS A CONSENT ADDRESS ONLY FOR A PROVIDER THIS SERVER
 * HOLDS KEYS FOR, AND REFUSES THE REST AS `providers/status` DESCRIBES THEM.
 *
 * NOT A FRAME ROW: `found-25-sep/oauth-start-answers-for-no-application`,
 * found closing `personal-calendar-connect-needs-integrations-manage`. A start
 * on a server with no keys for the provider answered 201 with a consent
 * address for `client_id=` — no application — which the provider answers with
 * an error page. `providers/status` said the provider was unavailable, and the
 * web withholds its button on that word, but the API answered anyway.
 *
 * The lanes hold keys that are not real for Google, Microsoft and GitHub
 * (`lane_oauth_env`), and none for Zoom, Linear, GitLab, Salesforce or
 * Dropbox, so both kinds are on the same server. Each provider is judged by
 * what `providers/status` says of it, never by a list written here.
 *
 *   node test/e2e/oauth-start-readiness.mjs --api 3021
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 2

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `osr${stamp}`
let WS = null
let A = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const status = await A(`/workspaces/${WS}/integrations/connections/providers/status`)
  const rows = Array.isArray(status.data) ? status.data : []
  if (status.status >= 300 || rows.length === 0) throw new Error(`providers/status answered nothing to judge by: ${said(status)}`)
  const start = (provider) => A(`/workspaces/${WS}/integrations/connections/${provider}/oauth/start`, { method: 'POST', body: {} })
  const clientIdOf = (url) => { try { return new URL(url).searchParams.get('client_id') } catch { return null } }
  const stateOf = (url) => { try { return new URL(url).searchParams.get('state') } catch { return null } }

  // ══ 1. NO KEYS ═══════════════════════════════════════════════════════════
  const keyless = rows.filter((r) => r.available === false).map((r) => r.provider)
  console.log(`\n▶ a start for each provider this server holds no keys for: ${keyless.join(', ') || 'none'}`)
  const refused = []
  for (const provider of keyless) {
    const res = await start(provider)
    refused.push({ provider, status: res.status, message: String(res.error?.message ?? ''), url: res.data?.authUrl ?? null })
  }
  const answeredAnyway = refused.filter((r) => !(r.status === 400 && /not configured/i.test(r.message) && /missing backend configuration/i.test(r.message) && r.url === null))
  chk(
    keyless.length > 0 && answeredAnyway.length === 0,
    'a start for a provider this server holds no keys for is refused (400) — saying it is not configured and what is missing — and answers no consent address, for every provider providers/status calls unavailable',
    keyless.length === 0
      ? 'providers/status calls every provider available here, so nothing measured the refusal'
      : answeredAnyway.map((r) => `${r.provider} ${r.status} ${JSON.stringify(r.message || (r.url ?? '').slice(0, 90))}`).join('; '),
  )

  // ══ 2. KEYS ══════════════════════════════════════════════════════════════
  const keyed = rows.filter((r) => r.available === true).map((r) => r.provider)
  console.log(`\n▶ a start for each provider this server holds keys for: ${keyed.join(', ') || 'none'}`)
  const answered = []
  for (const provider of keyed) {
    const res = await start(provider)
    const url = res.data?.authUrl ?? ''
    answered.push({ provider, status: res.status, clientId: clientIdOf(url), state: stateOf(url) })
  }
  const withoutApplication = answered.filter((r) => !(r.status === 201 && r.clientId && r.state))
  chk(
    keyed.length > 0 && withoutApplication.length === 0,
    'a start for a provider this server holds keys for answers a consent address with its client id and a signed state, for every provider providers/status calls available',
    keyed.length === 0
      ? 'providers/status calls no provider available here, so nothing measured a start that answers'
      : withoutApplication.map((r) => `${r.provider} ${r.status} client_id=${JSON.stringify(r.clientId)}`).join('; '),
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
