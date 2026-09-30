import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from './api'
import { brandingRetryDelayMs } from './branding-retry'

/*
 * A custom domain's branding lookup, refused for too many requests, is asked
 * again once after the wait it was given, and not for anything else
 * (`found-30-sep/public-pages-read-429-as-gone`).
 */
const refused = (retryAfter?: number) => new ApiError(429, 'Too many requests', retryAfter === undefined ? {} : { retryAfter })

test('the branding is asked again once, after the wait a 429 names', () => {
  assert.equal(brandingRetryDelayMs(refused(18), 0), 18_000)
})

test('a 429 that names no wait is asked again after five seconds', () => {
  assert.equal(brandingRetryDelayMs(refused(), 0), 5_000)
})

test('the branding is not asked a second time', () => {
  assert.equal(brandingRetryDelayMs(refused(18), 1), null)
})

test('a wait longer than a minute is not waited out', () => {
  assert.equal(brandingRetryDelayMs(refused(120), 0), null)
})

test('a 404, or a failure that is not a refusal, is not asked again', () => {
  assert.equal(brandingRetryDelayMs(new ApiError(404, 'Not found'), 0), null)
  assert.equal(brandingRetryDelayMs(new ApiError(500, 'Internal error'), 0), null)
  assert.equal(brandingRetryDelayMs(new Error('network'), 0), null)
})
