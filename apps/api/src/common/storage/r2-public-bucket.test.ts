import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CronExpression } from '@nestjs/schedule'
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants'
import { PUBLIC_DOMAIN_PROBE_PREFIX, R2Service } from './r2.service'
import { fakeStore, r2With } from './r2-test-store'

/*
 * THE PICTURES IN A BUCKET OF THEIR OWN, AND A DOMAIN THAT SERVES NOTHING ELSE
 * (`found-30-sep/public-cdn-url-makes-every-object-public`).
 *
 * Signing every private object was not enough. A custom domain connected to an
 * R2 bucket serves every key in it, the key of a task's file is in the path of
 * every signed URL for it, and the avatars and logos the domain was there for
 * sat in that same bucket — so anybody once handed the file could read it at
 * the domain for as long as it lived, and the images route told everybody where
 * the domain was. Cloudflare: "When you connect a Custom Domain, your R2 bucket
 * becomes publicly accessible."
 *
 * So the pictures live in `R2_PUBLIC_BUCKET_NAME` and nothing else does; the
 * domain is used only for them, only where they have that bucket, and only
 * while it is seen not to serve `R2_BUCKET_NAME`; and the pictures already
 * kept among the private objects are moved.
 */

const BASE = {
  R2_ENDPOINT: 'http://127.0.0.1:9101',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  R2_BUCKET_NAME: 'rundesk-v1',
}
const PRIVATE = BASE.R2_BUCKET_NAME
const PICTURES = 'rundesk-v1-pictures'
const CDN = 'https://files.example.com'

/** Which bucket a path-style URL of the store names, and whether it is signed. */
const bucketOf = (url: string) => {
  const u = new URL(url)
  return { bucket: u.origin === BASE.R2_ENDPOINT ? u.pathname.split('/')[1] : null, signed: u.searchParams.has('X-Amz-Signature') }
}

const AVATAR = 'avatars/u1-1790000000000.png'
const LOGO = 'workspace-logos/w1-1790000000000.png'
const FILE = 'workspaces/w1/tasks/t1/attachments/1790000000000-plan.pdf'

describe('R2Service — the pictures in a bucket of their own, and a domain that serves nothing else', () => {
  it('a picture is uploaded to, read from and signed for the pictures’ bucket; anything else, however it is spelt, stays in the private bucket', async () => {
    const r2 = r2With({ ...BASE, R2_PUBLIC_BUCKET_NAME: PICTURES })
    const store = fakeStore(r2)
    for (const key of [AVATAR, LOGO]) {
      assert.deepEqual(bucketOf(await r2.presignPutObject(key, 'image/png')), { bucket: PICTURES, signed: true }, `${key}'s upload`)
      assert.deepEqual(bucketOf(await r2.getObjectUrl(key)), { bucket: PICTURES, signed: true }, `${key}'s signed read`)
    }
    for (const key of [FILE, 'avatars/../workspaces/w1/tasks/t1/attachments/1790000000000-plan.pdf', 'avatars/sub/1790000000000.png', 'avatarsX/1.png']) {
      assert.deepEqual(bucketOf(await r2.presignPutObject(key, 'application/pdf')), { bucket: PRIVATE, signed: true }, `${key}'s upload`)
      assert.deepEqual(bucketOf(await r2.getObjectUrl(key)), { bucket: PRIVATE, signed: true }, `${key}'s signed read`)
    }
    await r2.putObject(LOGO, Buffer.from('logo'), 'image/png')
    await r2.putObject(FILE, Buffer.from('plan'), 'application/pdf')
    assert.equal((await r2.headObject(LOGO)).ContentLength, 4)
    assert.equal((await r2.getObject(FILE)).toString(), 'plan')
    assert.deepEqual([...store.bucket(PICTURES).keys()], [LOGO])
    assert.deepEqual([...store.bucket(PRIVATE).keys()], [FILE])
    // Without a bucket of their own — unset, or the private one named again — every picture is a private object.
    for (const env of [BASE, { ...BASE, R2_PUBLIC_BUCKET_NAME: PRIVATE }]) {
      assert.equal(bucketOf(await r2With(env).getObjectUrl(AVATAR)).bucket, PRIVATE)
    }
  })

  it('publicObjectUrl gives the public domain only where the pictures have a bucket of their own and the domain was seen not to serve the private one', async () => {
    // No bucket of their own: the domain is never used, even one that keeps the private bucket.
    const shared = r2With({ ...BASE, R2_PUBLIC_URL: CDN })
    const sharedStore = fakeStore(shared)
    assert.equal(await shared.checkPublicDomain(sharedStore.domain(CDN, PICTURES).fetchImpl), 'private-kept')
    assert.deepEqual(bucketOf(await shared.publicObjectUrl(AVATAR)), { bucket: PRIVATE, signed: true }, 'with no bucket of their own')
    // A bucket of their own, not yet checked: signed.
    const unchecked = r2With({ ...BASE, R2_PUBLIC_URL: CDN, R2_PUBLIC_BUCKET_NAME: PICTURES })
    assert.deepEqual(bucketOf(await unchecked.publicObjectUrl(AVATAR)), { bucket: PICTURES, signed: true }, 'before the check')
    // The domain still on the private bucket: signed.
    const onPrivate = r2With({ ...BASE, R2_PUBLIC_URL: CDN, R2_PUBLIC_BUCKET_NAME: PICTURES })
    assert.equal(await onPrivate.checkPublicDomain(fakeStore(onPrivate).domain(CDN, PRIVATE).fetchImpl), 'serves-private')
    assert.deepEqual(bucketOf(await onPrivate.publicObjectUrl(AVATAR)), { bucket: PICTURES, signed: true }, 'a domain on the private bucket')
    // No answer from the domain: signed.
    const silent = r2With({ ...BASE, R2_PUBLIC_URL: CDN, R2_PUBLIC_BUCKET_NAME: PICTURES })
    fakeStore(silent)
    const unreachable = (async () => { throw new Error('connect ECONNREFUSED') }) as unknown as typeof fetch
    assert.equal(await silent.checkPublicDomain(unreachable), 'unknown')
    assert.deepEqual(bucketOf(await silent.publicObjectUrl(AVATAR)), { bucket: PICTURES, signed: true }, 'a domain that did not answer')
    // A bucket of their own, and the domain on it alone: the domain.
    const own = r2With({ ...BASE, R2_PUBLIC_URL: CDN, R2_PUBLIC_BUCKET_NAME: PICTURES })
    assert.equal(await own.checkPublicDomain(fakeStore(own).domain(CDN, PICTURES).fetchImpl), 'private-kept')
    assert.equal(await own.publicObjectUrl(AVATAR), `${CDN}/${AVATAR}`)
    assert.equal(own.publicDomainState, 'private-kept')
  })

  it('checkPublicDomain puts an object among the private ones, reads it at the domain unsigned, and removes it: served back, the domain serves the private bucket', async () => {
    const r2 = r2With({ ...BASE, R2_PUBLIC_URL: CDN, R2_PUBLIC_BUCKET_NAME: PICTURES })
    const store = fakeStore(r2)
    const onPrivate = store.domain(CDN, PRIVATE)
    assert.equal(await r2.checkPublicDomain(onPrivate.fetchImpl), 'serves-private')
    const put = store.sent.find((s) => s.command === 'put')
    assert.ok(put, 'nothing was put')
    assert.equal(put.bucket, PRIVATE)
    assert.ok(put.key?.startsWith(PUBLIC_DOMAIN_PROBE_PREFIX), `the check's object was put at ${put.key}`)
    assert.deepEqual(onPrivate.asked, [`${CDN}/${put.key}`])
    assert.equal(new URL(onPrivate.asked[0]).search, '', 'the domain was asked with a signature')
    assert.ok(store.sent.some((s) => s.command === 'delete' && s.bucket === PRIVATE && s.key === put.key), 'the check left its object behind')
    assert.equal(store.bucket(PRIVATE).size, 0)
    // And a domain on the pictures' bucket does not serve it.
    assert.equal(await r2.checkPublicDomain(store.domain(CDN, PICTURES).fetchImpl), 'private-kept')
  })

  it('a later check that finds the private bucket served takes the domain away from the pictures', async () => {
    const r2 = r2With({ ...BASE, R2_PUBLIC_URL: CDN, R2_PUBLIC_BUCKET_NAME: PICTURES })
    const store = fakeStore(r2)
    await r2.checkPublicDomain(store.domain(CDN, PICTURES).fetchImpl)
    assert.equal(await r2.publicObjectUrl(LOGO), `${CDN}/${LOGO}`)
    // The domain is connected to the private bucket while the API runs.
    assert.equal(await r2.checkPublicDomain(store.domain(CDN, PRIVATE).fetchImpl), 'serves-private')
    assert.deepEqual(bucketOf(await r2.publicObjectUrl(LOGO)), { bucket: PICTURES, signed: true })
  })

  it('the domain is checked when the API starts, before its first request, and again every hour; the pictures are moved after', async () => {
    const r2 = r2With({ ...BASE, R2_PUBLIC_URL: CDN, R2_PUBLIC_BUCKET_NAME: PICTURES })
    const order: string[] = []
    let releaseCheck: () => void = () => {}
    const self = r2 as unknown as { checkPublicDomain: () => Promise<unknown>; movePicturesToPublicBucket: () => Promise<unknown> }
    self.checkPublicDomain = () => {
      order.push('check started')
      return new Promise((resolve) => (releaseCheck = () => { order.push('check done'); resolve('private-kept') }))
    }
    self.movePicturesToPublicBucket = async () => { order.push('move'); return { moved: 0, failed: 0 } }
    const booted = r2.onApplicationBootstrap().then(() => order.push('booted'))
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(order, ['check started'], 'the API went on before the domain was checked')
    releaseCheck()
    await booted
    assert.deepEqual(order, ['check started', 'check done', 'move', 'booted'])
    const cron = Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, R2Service.prototype.recheckPublicDomain) as { cronTime?: string } | undefined
    assert.equal(cron?.cronTime, CronExpression.EVERY_HOUR, 'the check is not run again every hour')
  })

  it('movePicturesToPublicBucket moves each picture kept among the private objects into the pictures’ bucket, with its type and metadata, and nothing else', async () => {
    const r2 = r2With({ ...BASE, R2_PUBLIC_BUCKET_NAME: PICTURES })
    const store = fakeStore(r2)
    const priv = store.bucket(PRIVATE)
    priv.set(AVATAR, { body: Buffer.from('avatar'), contentType: 'image/png', metadata: { uploadedby: 'u1' } })
    priv.set(LOGO, { body: Buffer.from('<svg/>'), contentType: 'image/svg+xml', metadata: { workspaceid: 'w1' } })
    priv.set('avatars/sub/1790000000000.png', { body: Buffer.from('odd'), contentType: 'image/png' })
    priv.set(FILE, { body: Buffer.from('plan'), contentType: 'application/pdf' })
    assert.deepEqual(await r2.movePicturesToPublicBucket(), { moved: 2, failed: 0 })
    const pics = store.bucket(PICTURES)
    assert.deepEqual([...pics.keys()].sort(), [AVATAR, LOGO])
    assert.equal(pics.get(AVATAR)!.body.toString(), 'avatar')
    assert.equal(pics.get(AVATAR)!.contentType, 'image/png')
    assert.deepEqual(pics.get(AVATAR)!.metadata, { uploadedby: 'u1' })
    assert.equal(pics.get(LOGO)!.contentType, 'image/svg+xml')
    assert.deepEqual([...priv.keys()].sort(), ['avatars/sub/1790000000000.png', FILE])
    // Idempotent: nothing is left to move.
    assert.deepEqual(await r2.movePicturesToPublicBucket(), { moved: 0, failed: 0 })
    // And without a bucket of their own nothing moves.
    const shared = r2With(BASE)
    fakeStore(shared).bucket(PRIVATE).set(AVATAR, { body: Buffer.from('a') })
    assert.deepEqual(await shared.movePicturesToPublicBucket(), { moved: 0, failed: 0 })
  })

  it('a workspace’s logos are listed and deleted in both buckets, so one not yet moved is purged too', async () => {
    const r2 = r2With({ ...BASE, R2_PUBLIC_BUCKET_NAME: PICTURES })
    const store = fakeStore(r2)
    store.bucket(PRIVATE).set('workspace-logos/w1-1.png', { body: Buffer.from('old') })
    store.bucket(PICTURES).set('workspace-logos/w1-2.png', { body: Buffer.from('new') })
    store.bucket(PRIVATE).set(FILE, { body: Buffer.from('plan') })
    const listed = (await r2.listAllObjects('workspace-logos/w1-')).map((o) => o.Key)
    assert.deepEqual(listed, ['workspace-logos/w1-1.png', 'workspace-logos/w1-2.png'])
    for (const key of listed) await r2.deleteObject(key!)
    assert.equal(store.bucket(PRIVATE).has('workspace-logos/w1-1.png'), false)
    assert.equal(store.bucket(PICTURES).has('workspace-logos/w1-2.png'), false)
    // A private prefix is listed, and a private key deleted, in the private bucket alone.
    const before = store.sent.length
    assert.deepEqual((await r2.listAllObjects('workspaces/w1/')).map((o) => o.Key), [FILE])
    await r2.deleteObject(FILE)
    assert.deepEqual(store.sent.slice(before).map((s) => s.bucket), [PRIVATE, PRIVATE])
  })
})
