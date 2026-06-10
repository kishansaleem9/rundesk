import test from 'node:test'
import assert from 'node:assert/strict'
import { ipMatches, isIpAllowed, isValidIpRule, parseIp } from './ip-allowlist.util'

test('IPv4 exact match', () => {
  assert.equal(ipMatches('198.51.100.42', '198.51.100.42'), true)
  assert.equal(ipMatches('198.51.100.42', '198.51.100.43'), false)
})

test('IPv4 CIDR ranges', () => {
  assert.equal(ipMatches('203.0.113.0/24', '203.0.113.42'), true)
  assert.equal(ipMatches('203.0.113.0/24', '203.0.113.255'), true)
  assert.equal(ipMatches('203.0.113.0/24', '203.0.114.1'), false)
  assert.equal(ipMatches('10.0.0.0/8', '10.255.13.7'), true)
  assert.equal(ipMatches('10.0.0.0/8', '11.0.0.1'), false)
  assert.equal(ipMatches('0.0.0.0/0', '8.8.8.8'), true) // match-all
})

test('IPv4 /32 behaves like exact', () => {
  assert.equal(ipMatches('192.168.1.10/32', '192.168.1.10'), true)
  assert.equal(ipMatches('192.168.1.10/32', '192.168.1.11'), false)
})

test('IPv6 exact and CIDR', () => {
  assert.equal(ipMatches('2001:db8::/32', '2001:db8:abcd::1'), true)
  assert.equal(ipMatches('2001:db8::/32', '2001:db9::1'), false)
  assert.equal(ipMatches('2001:db8::1', '2001:db8::1'), true)
  assert.equal(ipMatches('::1', '::1'), true) // loopback
  assert.equal(ipMatches('::/0', '2001:db8::1'), true)
})

test('IPv4-mapped IPv6 normalises to IPv4', () => {
  // Server reports client as ::ffff:203.0.113.42 — a plain v4 rule must match.
  assert.equal(ipMatches('203.0.113.0/24', '::ffff:203.0.113.42'), true)
  assert.equal(ipMatches('203.0.113.42', '::ffff:203.0.113.42'), true)
  assert.equal(parseIp('::ffff:203.0.113.42')?.version, 4)
})

test('version mismatch never matches', () => {
  assert.equal(ipMatches('203.0.113.0/24', '2001:db8::1'), false)
  assert.equal(ipMatches('2001:db8::/32', '203.0.113.42'), false)
})

test('garbage rules / addresses do not match (fail-closed matcher)', () => {
  assert.equal(ipMatches('not-an-ip', '203.0.113.42'), false)
  assert.equal(ipMatches('203.0.113.0/99', '203.0.113.42'), false)
  assert.equal(ipMatches('999.0.0.1', '999.0.0.1'), false)
  assert.equal(ipMatches('203.0.113.0/24', 'nonsense'), false)
})

test('isIpAllowed: empty list and missing ip are false (caller fails open)', () => {
  assert.equal(isIpAllowed('203.0.113.42', []), false)
  assert.equal(isIpAllowed(null, ['203.0.113.0/24']), false)
  assert.equal(isIpAllowed(undefined, ['203.0.113.0/24']), false)
})

test('isIpAllowed matches any rule in the list', () => {
  const list = ['203.0.113.0/24', '198.51.100.42', '2001:db8::/32']
  assert.equal(isIpAllowed('203.0.113.7', list), true)
  assert.equal(isIpAllowed('198.51.100.42', list), true)
  assert.equal(isIpAllowed('2001:db8::dead', list), true)
  assert.equal(isIpAllowed('8.8.8.8', list), false)
})

test('isValidIpRule', () => {
  for (const ok of ['203.0.113.0/24', '198.51.100.42', '2001:db8::/32', '::1', '10.0.0.0/8']) {
    assert.equal(isValidIpRule(ok), true, ok)
  }
  for (const bad of ['', '   ', 'hello', '203.0.113.0/33', '2001:db8::/129', '256.0.0.1', '1.2.3']) {
    assert.equal(isValidIpRule(bad), false, bad)
  }
})
