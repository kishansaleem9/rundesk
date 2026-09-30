import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fakeStore, r2With } from './r2-test-store'

/*
 * WHAT SITS BEHIND A READ RULE IS SIGNED, WHATEVER `R2_PUBLIC_URL` SAYS
 * (`found-30-sep/public-cdn-url-makes-every-object-public`). `getObjectUrl`
 * answered `${R2_PUBLIC_URL}/<key>` for every object where that was a public
 * domain, so a task's files, a clip, a recording and a chat file were each at a
 * permanent address anybody once handed it could keep. The pictures on show —
 * avatars and workspace logos — are public by design, and keep the domain
 * where they have a bucket of their own and the domain serves nothing else
 * (`r2-public-bucket.test.ts`).
 */

const BASE = {
  R2_ENDPOINT: 'http://127.0.0.1:9101',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  R2_BUCKET_NAME: 'rundesk-v1',
}
const CDN = 'https://cdn.example.com/files'
const PICTURES = 'rundesk-v1-pictures'

/** A presigned GET on the store's own endpoint, of `bucket`, and for how many seconds. */
const signedFor = (url: string, bucket: string = BASE.R2_BUCKET_NAME): number | null => {
  const u = new URL(url)
  if (u.origin !== BASE.R2_ENDPOINT || !u.pathname.startsWith(`/${bucket}/`)) return null
  if (!u.searchParams.has('X-Amz-Signature')) return null
  return Number(u.searchParams.get('X-Amz-Expires'))
}

const PRIVATE_KEYS = [
  'workspaces/w1/tasks/t1/attachments/1790000000000-plan.pdf',
  'workspaces/w1/clips/1790000000000-demo.webm',
  'calls/w1/c1/recording-1790000000000.webm',
  'chat/ch1/attachments/1790000000000-photo.png',
  'forms/f1/uploads/1790000000000-cv.pdf',
]

describe('R2Service — private objects are signed, whatever R2_PUBLIC_URL says', () => {
  it('getObjectUrl signs every key though R2_PUBLIC_URL is a public domain, for fifteen minutes unless asked', async () => {
    const r2 = r2With({ ...BASE, R2_PUBLIC_URL: CDN })
    for (const key of PRIVATE_KEYS) {
      const url = await r2.getObjectUrl(key)
      assert.equal(url.startsWith(CDN), false, `${key} was handed out at its public address: ${url}`)
      assert.equal(signedFor(url), 900, `${key} was not signed for 900 s: ${url}`)
    }
    assert.equal(signedFor(await r2.getObjectUrl(PRIVATE_KEYS[1], 10)), 10)
  })

  it('and so is an avatar asked for as an object, since only publicObjectUrl serves the public domain', async () => {
    const r2 = r2With({ ...BASE, R2_PUBLIC_URL: CDN })
    assert.equal(signedFor(await r2.getObjectUrl('avatars/u1-1790000000000.png')), 900)
  })

  /** The deployment the pictures keep the domain in: a bucket of their own, and the domain on it alone, checked. */
  const withPicturesDomain = async (publicUrl: string = CDN) => {
    const r2 = r2With({ ...BASE, R2_PUBLIC_URL: publicUrl, R2_PUBLIC_BUCKET_NAME: PICTURES })
    const store = fakeStore(r2)
    assert.equal(await r2.checkPublicDomain(store.domain(publicUrl.replace(/\/$/, ''), PICTURES).fetchImpl), 'private-kept')
    return r2
  }

  it('publicObjectUrl serves an avatar and a workspace logo from the public domain, unsigned', async () => {
    const r2 = await withPicturesDomain(`${CDN}/`)
    assert.equal(await r2.publicObjectUrl('avatars/u1-1790000000000.png'), `${CDN}/avatars/u1-1790000000000.png`)
    assert.equal(await r2.publicObjectUrl('workspace-logos/w1-1790000000000.png'), `${CDN}/workspace-logos/w1-1790000000000.png`)
  })

  it('publicObjectUrl signs anything that is not a picture on show, however the key is written', async () => {
    const r2 = await withPicturesDomain()
    for (const key of [
      ...PRIVATE_KEYS,
      'avatars/../workspaces/w1/tasks/t1/attachments/1790000000000-plan.pdf',
      'avatars/sub/1790000000000.png',
      'avatars/',
      'avatarsX/1790000000000.png',
    ]) {
      const url = await r2.publicObjectUrl(key)
      assert.equal(url.startsWith(CDN), false, `${key} was served from the public domain: ${url}`)
      assert.equal(signedFor(url), 900, `${key} was not signed: ${url}`)
    }
  })

  it('publicObjectUrl signs a picture too where there is no public domain, or the domain is the raw R2 API host', async () => {
    // A bucket of their own, and every check answered as a domain on it alone
    // would answer: all that is missing is a public domain.
    const none = r2With({ ...BASE, R2_PUBLIC_BUCKET_NAME: PICTURES })
    await none.checkPublicDomain(fakeStore(none).domain(CDN, PICTURES).fetchImpl)
    assert.equal(signedFor(await none.publicObjectUrl('avatars/u1-1790000000000.png'), PICTURES), 900)
    const RAW = 'https://acct.r2.cloudflarestorage.com/rundesk-v1-pictures'
    const rawApi = r2With({ ...BASE, R2_PUBLIC_URL: RAW, R2_PUBLIC_BUCKET_NAME: PICTURES })
    await rawApi.checkPublicDomain(fakeStore(rawApi).domain(RAW, PICTURES).fetchImpl)
    assert.equal(signedFor(await rawApi.publicObjectUrl('avatars/u1-1790000000000.png'), PICTURES), 900)
  })
})
