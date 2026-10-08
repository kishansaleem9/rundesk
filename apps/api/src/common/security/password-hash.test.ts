import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'
import { compareSync, getRounds, hashSync } from 'bcryptjs'
import { DEFAULT_THREADS, NO_ACCOUNT_HASH, PASSWORD_HASH_COST, PasswordHasher, passwords } from './password-hash'

/**
 * PASSWORDS ARE HASHED ON WORKER THREADS, AT ONE COST
 * (`found-30-sep/password-hash-holds-the-event-loop`), AND A SIGN-IN WITH
 * NOTHING TO COMPARE COMPARES `NO_ACCOUNT_HASH` (`found-30-sep/sign-in-time-tells-an-account`).
 *
 * `password-hash-time.mjs` measures both on a lane: a plain read beside eight
 * sign-ins hashing at once, and the time of each kind of refused sign-in.
 */

/** Every .ts file under apps/api/src but the tests. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}
const API_SRC = join(__dirname, '..', '..')

describe('Passwords are hashed on worker threads, at one cost', () => {
  it('a hash is bcrypt at cost 12, and compares true with its password and false with another', async () => {
    const made = await passwords.hash('Correct@12345!')
    assert.equal(getRounds(made), PASSWORD_HASH_COST)
    assert.equal(PASSWORD_HASH_COST, 12)
    assert.equal(compareSync('Correct@12345!', made), true, 'bcryptjs itself does not read the hash as the password’s')
    assert.equal(await passwords.compare('Correct@12345!', made), true)
    assert.equal(await passwords.compare('Wrong@12345!', made), false)
    assert.equal(getRounds(await passwords.hash('code', 10)), 10, 'a cost that is named is the cost used')
  })

  it('a compare runs off the event loop: a 10 ms timer keeps ticking through a cost-12 compare', async () => {
    const stored = hashSync('Correct@12345!', 12)
    await passwords.compare('warm', stored) // a worker started, so its start is not what is measured
    let ticks = 0
    const timer = setInterval(() => (ticks += 1), 10)
    const started = Date.now()
    try {
      assert.equal(await passwords.compare('Wrong@12345!', stored), false)
    } finally {
      clearInterval(timer)
    }
    const took = Date.now() - started
    // On the event loop the timer cannot fire during the compare (sync), or
    // fires once between bcryptjs's 100 ms chunks (its async form): 0 to 3
    // ticks in 290 ms. Off it, one every 10 ms.
    assert.ok(took >= 100, `the compare took ${took} ms: too quick to show anything`)
    assert.ok(ticks >= 10, `the timer ticked ${ticks} times in the ${took} ms the compare took: the compare held the event loop`)
  })

  it('NO_ACCOUNT_HASH is a bcrypt hash at the cost every password has, and matches nothing a sign-in sends', async () => {
    assert.equal(getRounds(NO_ACCOUNT_HASH), PASSWORD_HASH_COST)
    assert.equal(NO_ACCOUNT_HASH.length, 60)
    for (const guess of ['', 'password', 'Admin@123!', NO_ACCOUNT_HASH]) {
      assert.equal(await passwords.compare(guess, NO_ACCOUNT_HASH), false, `${JSON.stringify(guess)} matched the no-account hash`)
    }
  })

  it('a hash made at a lower cost is due to be made again, one at today’s is not, and a malformed one is left alone', () => {
    assert.equal(passwords.needsRehash(hashSync('x', 10)), true)
    assert.equal(passwords.needsRehash(hashSync('x', 4)), true)
    assert.equal(passwords.needsRehash(NO_ACCOUNT_HASH), false)
    assert.equal(passwords.needsRehash('not a bcrypt hash'), false)
  })

  it('with no worker to be had, a hash and a compare are still answered, on this thread', async () => {
    const hereOnly = new PasswordHasher(0)
    const made = await hereOnly.hash('Correct@12345!', 4)
    assert.equal(await hereOnly.compare('Correct@12345!', made), true)
    assert.equal(await hereOnly.compare('Wrong@12345!', made), false)
  })

  /*
   * A BURST IS ANSWERED BY THE COMPARES THAT END BEFORE THE LOCK
   * (`found-30-sep/a-burst-is-compared-before-the-lock`): at most the lockout's
   * threshold and the compares in flight beside the one that locks. So the
   * compares in flight are bounded, by the pool's threads, and on this thread
   * by one.
   */
  it('a pool runs at most its threads’ compares at once, never more than four on any machine, and the rest in turn', async () => {
    assert.ok(DEFAULT_THREADS >= 1 && DEFAULT_THREADS <= 4, `the pool has ${DEFAULT_THREADS} threads`)
    const hasher = new PasswordHasher(2)
    const stored = hashSync('Correct@12345!', 4)
    const answers = ['Correct@12345!', 'Wrong@1', 'Wrong@2', 'Wrong@3', 'Correct@12345!'].map((plain) => hasher.compare(plain, stored))
    const inside = hasher as unknown as { running: Map<unknown, unknown>; waiting: unknown[] }
    assert.equal(inside.running.size, 2, 'compares running at once')
    assert.equal(inside.waiting.length, 3, 'compares waiting their turn')
    assert.deepEqual(await Promise.all(answers), [true, false, false, false, true])
  })

  it('with no worker to be had, compares run on this thread one at a time, the rest in turn', async () => {
    const hereOnly = new PasswordHasher(0)
    const stored = hashSync('Correct@12345!', 4)
    const order: number[] = []
    const answers = ['Correct@12345!', 'Wrong@1', 'Correct@12345!'].map((plain, i) =>
      hereOnly.compare(plain, stored).then((value) => {
        order.push(i)
        return value
      }),
    )
    const inside = hereOnly as unknown as { hereRunning: number; hereWaiting: unknown[] }
    assert.equal(inside.hereRunning, 1, 'compares running on this thread at once')
    assert.equal(inside.hereWaiting.length, 2, 'compares waiting their turn')
    assert.deepEqual(await Promise.all(answers), [true, false, true])
    assert.deepEqual(order, [0, 1, 2])
    assert.equal(inside.hereRunning, 0)
  })

  it('a worker that dies mid-compare costs no answer: the compare is finished on this thread', async () => {
    const hasher = new PasswordHasher(1)
    const stored = hashSync('Correct@12345!', 12)
    const answer = hasher.compare('Correct@12345!', stored)
    const running = (hasher as unknown as { running: Map<{ terminate(): Promise<number> }, unknown> }).running
    const [worker] = [...running.keys()]
    assert.ok(worker, 'the compare was not handed to a worker')
    await worker.terminate()
    assert.equal(await answer, true)
    assert.equal(await hasher.compare('Wrong@12345!', stored), false, 'the next compare was not answered')
  })

  it('no module of the API but this one imports bcryptjs, so no hash runs on the event loop', () => {
    const importers = sources(API_SRC)
      .filter((file) => /(?:from\s+|require\(|import\()\s*['"]bcryptjs['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(API_SRC, file))
    assert.deepEqual(importers, [join('common', 'security', 'password-hash.ts')])
  })
})
