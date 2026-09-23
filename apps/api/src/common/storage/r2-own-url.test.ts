import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { R2Service } from './r2.service'

const r2With = (env: Record<string, string>) =>
  new R2Service({ get: (k: string) => env[k] } as never)

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
    const r2 = r2With({ ...BASE, R2_PUBLIC_URL: 'https://cdn.example.com/files' })
    const url = await r2.getObjectUrl('calls/w1/c1/recording-1.webm')
    assert.equal(r2.keyFromOwnUrl(url), 'calls/w1/c1/recording-1.webm')
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
