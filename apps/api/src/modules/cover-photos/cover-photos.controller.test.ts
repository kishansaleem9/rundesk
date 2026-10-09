import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BadGatewayException, BadRequestException, HttpStatus, ServiceUnavailableException } from '@nestjs/common'
import { CoverPhotosController, libraryRefusal } from './cover-photos.controller'
import { PhotoLibraryFailed, toLibraryPhoto } from './photo-library'

const WS = '00000000-0000-4000-8000-000000000001'
const withKey = async (key: string | undefined, fn: () => Promise<void>) => {
  const before = process.env.UNSPLASH_ACCESS_KEY
  if (key === undefined) delete process.env.UNSPLASH_ACCESS_KEY
  else process.env.UNSPLASH_ACCESS_KEY = key
  try {
    await fn()
  } finally {
    if (before === undefined) delete process.env.UNSPLASH_ACCESS_KEY
    else process.env.UNSPLASH_ACCESS_KEY = before
  }
}

test('with no key for the library, a search and a use say photo search is not set up (503)', async () => {
  await withKey(undefined, async () => {
    const c = new CoverPhotosController()
    await assert.rejects(c.search(WS, 'mountain'), ServiceUnavailableException)
    await assert.rejects(c.use(WS, 'AAAAAAAAAAA'), ServiceUnavailableException)
  })
})

test('a blank search, one past a hundred characters, a page past fifty, and a photo id of another shape are refused before the library is asked', async () => {
  await withKey('k', async () => {
    const c = new CoverPhotosController()
    await assert.rejects(c.search(WS, '   '), BadRequestException)
    await assert.rejects(c.search(WS, 'x'.repeat(101)), BadRequestException)
    await assert.rejects(c.search(WS, 'mountain', '51'), BadRequestException)
    await assert.rejects(c.search(WS, 'mountain', '1.5'), BadRequestException)
    await assert.rejects(c.use(WS, '../photos'), BadRequestException)
  })
})

test('the library’s rate limit is said as too many searches (429), anything else as a library that did not answer (502)', () => {
  assert.equal(libraryRefusal(new PhotoLibraryFailed(403, 'x')).getStatus(), HttpStatus.TOO_MANY_REQUESTS)
  assert.equal(libraryRefusal(new PhotoLibraryFailed(429, 'x')).getStatus(), HttpStatus.TOO_MANY_REQUESTS)
  assert.ok(libraryRefusal(new PhotoLibraryFailed(500, 'x')) instanceof BadGatewayException)
  assert.ok(libraryRefusal(new PhotoLibraryFailed(0, 'x')) instanceof BadGatewayException)
})

test('a photo is credited to its photographer and Unsplash with the referral, and one with nothing to draw is no result', () => {
  const p = toLibraryPhoto({
    id: 'abc123def45',
    urls: { regular: 'https://images.test/r.jpg', small: 'https://images.test/s.jpg' },
    links: { html: 'https://unsplash.com/photos/abc123def45' },
    user: { name: 'Aiko Tanaka', username: 'aikotanaka', links: { html: 'https://unsplash.com/@aikotanaka' } },
    description: 'A ridge at dawn',
  })
  assert.equal(p?.author.name, 'Aiko Tanaka')
  assert.equal(p?.author.url, 'https://unsplash.com/@aikotanaka?utm_source=rundesk&utm_medium=referral')
  assert.equal(p?.pageUrl, 'https://unsplash.com/photos/abc123def45?utm_source=rundesk&utm_medium=referral')
  assert.equal(p?.url, 'https://images.test/r.jpg')
  assert.equal(p?.thumbUrl, 'https://images.test/s.jpg')
  assert.equal(toLibraryPhoto({ id: 'x', urls: {} }), null)
})
