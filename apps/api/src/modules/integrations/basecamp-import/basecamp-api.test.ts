import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { BasecampClient, BasecampError, basecampAuthorizeUrl, basecampIdentity, exchangeBasecampCode, nextLink } from './basecamp-api'

/**
 * BASECAMP 3 READ FOR AN IMPORT (`commit-log/log-601eacc-2`): its sign-in, its
 * paged lists, its refusals — against a fetch that answers as Basecamp does.
 */
const ORIGIN = 'https://3.basecampapi.test'
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = { ...process.env }
  process.env.BASECAMP_API_ORIGIN = ORIGIN
  process.env.BASECAMP_LAUNCHPAD_URL = 'https://launchpad.test'
  process.env.BASECAMP_CLIENT_ID = 'cid'
  process.env.BASECAMP_CLIENT_SECRET = 'secret'
})
afterEach(() => {
  process.env = saved as NodeJS.ProcessEnv
})

type Answer = { status?: number; body?: unknown; headers?: Record<string, string> }
function fakeFetch(answers: Array<(url: string, init?: RequestInit) => Answer>) {
  const asked: Array<{ url: string; init?: RequestInit }> = []
  const fn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    asked.push({ url, init })
    const answer = answers[Math.min(asked.length - 1, answers.length - 1)](url, init)
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status ?? 200, headers: answer.headers })
  }) as typeof fetch
  return { fn, asked }
}

describe('the sign-in', () => {
  it('sends the person to Launchpad with type=web_server, its client and the signed state', () => {
    const url = new URL(basecampAuthorizeUrl('https://api.test/api/v1/import/basecamp/callback', 'signed.state'))
    assert.equal(url.origin + url.pathname, 'https://launchpad.test/authorization/new')
    assert.equal(url.searchParams.get('type'), 'web_server')
    assert.equal(url.searchParams.get('client_id'), 'cid')
    assert.equal(url.searchParams.get('state'), 'signed.state')
  })

  it('exchanges the code at Launchpad’s token address, and a refused code is the refusal in words', async () => {
    const ok = fakeFetch([() => ({ body: { access_token: 'tok', refresh_token: 'ref', expires_in: 1209600 } })])
    const token = await exchangeBasecampCode('the-code', 'https://api.test/cb', ok.fn)
    assert.equal(token.accessToken, 'tok')
    assert.equal(token.refreshToken, 'ref')
    const asked = new URL(ok.asked[0].url)
    assert.equal(asked.pathname, '/authorization/token')
    assert.equal(asked.searchParams.get('type'), 'web_server')
    assert.equal(asked.searchParams.get('code'), 'the-code')
    assert.equal(ok.asked[0].init?.method, 'POST')
    const refused = fakeFetch([() => ({ status: 400, body: { error: 'invalid_grant' } })])
    await assert.rejects(() => exchangeBasecampCode('bad', 'https://api.test/cb', refused.fn), /sign in to Basecamp again/)
  })

  it('reads whose grant it is and only the Basecamp 3 accounts it opens', async () => {
    const f = fakeFetch([
      () => ({
        body: {
          identity: { id: 1, first_name: 'Ana', last_name: 'Ruiz', email_address: 'Ana@Example.com' },
          accounts: [
            { product: 'bc3', id: 99, name: 'Studio', href: `${ORIGIN}/99/` },
            { product: 'bcx', id: 5, name: 'Old', href: 'https://basecamp.com/5/api/v1' },
          ],
        },
      }),
    ])
    const who = await basecampIdentity('tok', f.fn)
    assert.deepEqual(who, { id: '1', name: 'Ana Ruiz', email: 'ana@example.com', accounts: [{ id: '99', name: 'Studio', href: `${ORIGIN}/99` }] })
    assert.equal((f.asked[0].init?.headers as Record<string, string>).Authorization, 'Bearer tok')
  })
})

describe('BasecampClient — an account’s lists, every page of them', () => {
  it('follows `Link: <…>; rel="next"` to the last page', async () => {
    const f = fakeFetch([
      () => ({ body: [{ id: 1 }, { id: 2 }], headers: { link: `<${ORIGIN}/99/projects.json?page=2>; rel="next"` } }),
      () => ({ body: [{ id: 3 }] }),
    ])
    const rows = await new BasecampClient('tok', f.fn).all<{ id: number }>(`${ORIGIN}/99/projects.json`)
    assert.deepEqual(rows.map((r) => r.id), [1, 2, 3])
    assert.equal(f.asked[1].url, `${ORIGIN}/99/projects.json?page=2`)
  })

  it('waits out a 429 as Basecamp asks, then reads on', async () => {
    const f = fakeFetch([() => ({ status: 429, headers: { 'retry-after': '0' } }), () => ({ body: [{ id: 7 }] })])
    assert.deepEqual(await new BasecampClient('tok', f.fn).all(`${ORIGIN}/99/projects.json`), [{ id: 7 }])
    assert.equal(f.asked.length, 2)
  })

  it('refuses an address off Basecamp’s API origin before asking it, and says a revoked grant in words', async () => {
    const f = fakeFetch([() => ({ body: [] })])
    await assert.rejects(() => new BasecampClient('tok', f.fn).all('http://169.254.169.254/latest/meta-data'), BasecampError)
    assert.equal(f.asked.length, 0, 'nothing was asked of it')
    const revoked = fakeFetch([() => ({ status: 401 })])
    await assert.rejects(() => new BasecampClient('tok', revoked.fn).all(`${ORIGIN}/99/projects.json`), /sign in to Basecamp again/)
  })

  it('reads a project’s lists through the to-do set its dock names, and none when its to-dos are off', async () => {
    const f = fakeFetch([
      () => ({ body: { id: 3, todolists_url: `${ORIGIN}/99/buckets/1/todosets/3/todolists.json` } }),
      () => ({ body: [{ id: 10, name: 'Launch' }] }),
    ])
    const client = new BasecampClient('tok', f.fn)
    const lists = await client.todolists({ id: 1, name: 'P', dock: [{ name: 'todoset', enabled: true, url: `${ORIGIN}/99/buckets/1/todosets/3.json` }] })
    assert.deepEqual(lists, [{ id: 10, name: 'Launch' }])
    assert.deepEqual(await client.todolists({ id: 2, name: 'Q', dock: [{ name: 'todoset', enabled: false, url: `${ORIGIN}/x.json` }] }), [])
  })

  it('a list’s to-dos are its open ones and then its done ones', async () => {
    const f = fakeFetch([(url) => ({ body: url.includes('completed=true') ? [{ id: 2, completed: true }] : [{ id: 1 }] })])
    const todos = await new BasecampClient('tok', f.fn).todos(`${ORIGIN}/99/buckets/1/todolists/10/todos.json`)
    assert.deepEqual(todos.map((t) => t.id), [1, 2])
  })
})

describe('nextLink', () => {
  it('finds the next page among the relations a Link header names', () => {
    assert.equal(nextLink('<https://a/x?page=1>; rel="prev", <https://a/x?page=3>; rel="next"'), 'https://a/x?page=3')
    assert.equal(nextLink('<https://a/x?page=1>; rel="prev"'), null)
    assert.equal(nextLink(null), null)
  })
})
