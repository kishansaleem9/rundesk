import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isPrivateOrReservedIp, checkUnfurlUrl, parseOgMetadata } from './link-unfurl'

/**
 * SSRF is the whole risk of server-side unfurl (Plan §6.3): the user controls
 * the URL and we make the outbound request. These tests pin the PURE safety
 * functions — the IP classifier and the URL check — proving the blocked ranges
 * really are blocked, that a normal public host is allowed, and that non-http
 * schemes are refused. The DNS-resolution path reuses `isPrivateOrReservedIp`
 * on every resolved address, so covering the classifier covers rebinding too.
 */
describe('isPrivateOrReservedIp — IPv4 blocked ranges', () => {
  const blocked = [
    ['loopback 127.0.0.1', '127.0.0.1'],
    ['loopback 127.9.9.9', '127.9.9.9'],
    ['private 10/8', '10.0.0.1'],
    ['private 172.16/12', '172.16.5.4'],
    ['private 172.31 edge', '172.31.255.255'],
    ['private 192.168/16', '192.168.1.1'],
    ['link-local 169.254/16', '169.254.0.1'],
    ['cloud metadata 169.254.169.254', '169.254.169.254'],
    ['unspecified 0.0.0.0', '0.0.0.0'],
    ['CGNAT 100.64/10', '100.64.1.1'],
    ['multicast 224/4', '224.0.0.1'],
    ['reserved 240/4', '240.0.0.1'],
    ['broadcast', '255.255.255.255'],
  ] as const
  for (const [label, ip] of blocked) {
    it(`blocks ${label} (${ip})`, () => assert.equal(isPrivateOrReservedIp(ip), true))
  }
})

describe('isPrivateOrReservedIp — IPv4 public addresses are allowed', () => {
  const publicIps = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '11.0.0.1', '100.63.0.1']
  for (const ip of publicIps) {
    it(`allows ${ip}`, () => assert.equal(isPrivateOrReservedIp(ip), false))
  }
})

describe('isPrivateOrReservedIp — IPv6 blocked ranges', () => {
  const blocked = [
    ['loopback ::1', '::1'],
    ['unspecified ::', '::'],
    ['link-local fe80::/10', 'fe80::1'],
    ['link-local fe80 mid', 'fea0::abcd'],
    ['unique-local fc00::/7', 'fc00::1'],
    ['unique-local fd00', 'fd12:3456::1'],
    ['multicast ff00::/8', 'ff02::1'],
    ['IPv4-mapped loopback', '::ffff:127.0.0.1'],
    ['IPv4-mapped metadata', '::ffff:169.254.169.254'],
    ['IPv4-mapped private', '::ffff:10.0.0.1'],
  ] as const
  for (const [label, ip] of blocked) {
    it(`blocks ${label} (${ip})`, () => assert.equal(isPrivateOrReservedIp(ip), true))
  }
})

describe('isPrivateOrReservedIp — IPv6 public addresses are allowed', () => {
  const publicIps = ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']
  for (const ip of publicIps) {
    it(`allows ${ip}`, () => assert.equal(isPrivateOrReservedIp(ip), false))
  }
})

describe('isPrivateOrReservedIp — malformed input fails closed (blocked)', () => {
  for (const bad of ['not-an-ip', '', '999.999.999.999', '10.0.0', 'example.com']) {
    it(`blocks ${JSON.stringify(bad)}`, () => assert.equal(isPrivateOrReservedIp(bad), true))
  }
})

describe('checkUnfurlUrl — accepts normal public http(s) URLs', () => {
  it('accepts an https public host', () => {
    const res = checkUnfurlUrl('https://example.com/path?q=1')
    assert.equal(res.ok, true)
    if (res.ok) {
      assert.equal(res.hostname, 'example.com')
      assert.equal(res.literalIp, null)
    }
  })
  it('accepts a plain http public host', () => {
    assert.equal(checkUnfurlUrl('http://news.ycombinator.com/').ok, true)
  })
  it('accepts a public literal IP', () => {
    const res = checkUnfurlUrl('http://8.8.8.8/')
    assert.equal(res.ok, true)
    if (res.ok) assert.equal(res.literalIp, '8.8.8.8')
  })
})

describe('checkUnfurlUrl — rejects non-http(s) schemes', () => {
  const rejected: Array<[string, string]> = [
    ['file:///etc/passwd', 'scheme'],
    ['ftp://example.com/x', 'scheme'],
    ['gopher://example.com/', 'scheme'],
    ['data:text/html,<h1>hi', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
  ]
  for (const [url, reason] of rejected) {
    it(`rejects ${url}`, () => {
      const res = checkUnfurlUrl(url)
      assert.equal(res.ok, false)
      if (!res.ok) assert.equal(res.reason, reason)
    })
  }
})

describe('checkUnfurlUrl — rejects private/reserved literal-IP hosts', () => {
  const rejected = [
    'http://127.0.0.1/',
    'http://127.0.0.1:8080/admin',
    'http://10.0.0.5/',
    'http://192.168.0.1/',
    'http://172.16.9.9/',
    'http://169.254.169.254/latest/meta-data/', // cloud metadata
    'http://0.0.0.0/',
    'http://[::1]/', // IPv6 loopback (brackets stripped)
    'http://[fe80::1]/', // IPv6 link-local
    'https://[::ffff:127.0.0.1]/', // IPv4-mapped loopback
  ]
  for (const url of rejected) {
    it(`rejects ${url}`, () => {
      const res = checkUnfurlUrl(url)
      assert.equal(res.ok, false)
      if (!res.ok) assert.equal(res.reason, 'blocked-ip')
    })
  }
})

describe('checkUnfurlUrl — rejects malformed input', () => {
  it('rejects a non-URL string', () => {
    const res = checkUnfurlUrl('not a url')
    assert.equal(res.ok, false)
    if (!res.ok) assert.equal(res.reason, 'invalid-url')
  })
  it('rejects an empty string', () => {
    assert.equal(checkUnfurlUrl('').ok, false)
  })
})

describe('parseOgMetadata — extracts OG / Twitter / title metadata', () => {
  it('prefers Open-Graph tags and resolves a relative image', () => {
    const html = `<!doctype html><html><head>
      <title>Fallback Title</title>
      <meta property="og:title" content="OG Title" />
      <meta property="og:description" content="A great description &amp; more" />
      <meta property="og:image" content="/img/cover.png" />
      <meta property="og:site_name" content="Example Co" />
    </head><body>ignored</body></html>`
    const res = parseOgMetadata(html, 'https://example.com/article')
    assert.equal(res.title, 'OG Title')
    assert.equal(res.description, 'A great description & more')
    assert.equal(res.siteName, 'Example Co')
    assert.equal(res.image, 'https://example.com/img/cover.png')
  })

  it('falls back to twitter:* then <title> and the description meta', () => {
    const html = `<head>
      <title>The Title</title>
      <meta name="twitter:image" content="https://cdn.example.com/t.jpg">
      <meta name="description" content="Plain meta description">
    </head>`
    const res = parseOgMetadata(html, 'https://example.com/')
    assert.equal(res.title, 'The Title')
    assert.equal(res.description, 'Plain meta description')
    assert.equal(res.image, 'https://cdn.example.com/t.jpg')
  })

  it('drops an image that points at a private-IP literal', () => {
    const html = `<head><meta property="og:title" content="x">
      <meta property="og:image" content="http://127.0.0.1/secret.png"></head>`
    const res = parseOgMetadata(html, 'https://example.com/')
    assert.equal(res.title, 'x')
    assert.equal(res.image, undefined)
  })

  it('returns {} when the head has no usable metadata', () => {
    assert.deepEqual(parseOgMetadata('<head><meta charset="utf-8"></head>', 'https://example.com/'), {})
  })

  it('does not read metadata from the body', () => {
    const html = `<head><title>Head Title</title></head><body>
      <meta property="og:title" content="Body Title"></body>`
    const res = parseOgMetadata(html, 'https://example.com/')
    assert.equal(res.title, 'Head Title')
  })
})
