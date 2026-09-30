import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fakeStore, r2With } from './r2-test-store'

const BASE = {
  R2_ENDPOINT: 'http://127.0.0.1:9101',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  R2_BUCKET_NAME: 'rundesk-v1',
}

describe('R2Service.keyFromOwnUrl — telling a URL of our bucket from any other', () => {
  it('reads the key back out of a path-style presigned URL', async () => {
    const r2 = r2With(BASE)
    const url = await r2.getObjectUrl('calls/w1/c1/recording-1.webm')
    assert.equal(r2.keyFromOwnUrl(url), 'calls/w1/c1/recording-1.webm')
  })

  it('and out of a public-CDN URL', async () => {
    const CDN = 'https://cdn.example.com/files'
    const r2 = r2With({ ...BASE, R2_PUBLIC_URL: CDN, R2_PUBLIC_BUCKET_NAME: 'rundesk-v1-pictures' })
    await r2.checkPublicDomain(fakeStore(r2).domain(CDN, 'rundesk-v1-pictures').fetchImpl)
    // A picture on show is served there; every object was handed out there once
    // (`found-30-sep/public-cdn-url-makes-every-object-public`), and such a URL
    // may still be sent back.
    const picture = await r2.publicObjectUrl('avatars/u1-1.png')
    assert.equal(picture, `${CDN}/avatars/u1-1.png`)
    assert.equal(r2.keyFromOwnUrl(picture), 'avatars/u1-1.png')
    assert.equal(r2.keyFromOwnUrl('https://cdn.example.com/files/calls/w1/c1/recording-1.webm'), 'calls/w1/c1/recording-1.webm')
    // And the signed URL a recording is handed out as now.
    const url = await r2.getObjectUrl('calls/w1/c1/recording-1.webm')
    assert.equal(r2.keyFromOwnUrl(url), 'calls/w1/c1/recording-1.webm')
  })

  it('and out of a signed URL of the pictures’ own bucket', async () => {
    const r2 = r2With({ ...BASE, R2_PUBLIC_BUCKET_NAME: 'rundesk-v1-pictures' })
    const url = await r2.getObjectUrl('workspace-logos/w1-1.png')
    assert.equal(new URL(url).pathname.startsWith('/rundesk-v1-pictures/'), true, url)
    assert.equal(r2.keyFromOwnUrl(url), 'workspace-logos/w1-1.png')
  })

  it('answers null for a link that is not ours — another host, another bucket, not a URL', () => {
    const r2 = r2With(BASE)
    assert.equal(r2.keyFromOwnUrl('https://zoom.us/rec/share/abc'), null)
    assert.equal(r2.keyFromOwnUrl('http://127.0.0.1:9101/another-bucket/x.webm'), null)
    assert.equal(r2.keyFromOwnUrl('calls/w1/c1/recording-1.webm'), null)
  })

  it('and null when storage is not configured at all', () => {
    assert.equal(r2With({}).keyFromOwnUrl('http://127.0.0.1:9101/rundesk-v1/x'), null)
  })
})
