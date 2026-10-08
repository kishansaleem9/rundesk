import { Logger } from '@nestjs/common'
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import { compare as compareOnThisThread, getRounds, hash as hashOnThisThread } from 'bcryptjs'

/**
 * EVERY PASSWORD IS HASHED AND COMPARED ON A WORKER THREAD, AT ONE COST
 * (`found-30-sep/password-hash-holds-the-event-loop`).
 *
 * A bcrypt hash at cost 12 is about 290 ms of arithmetic here. The API used
 * `hashSync` and `compareSync` (sign-up, register, reset, an invitation's
 * claim, sign-in), and the API has one JavaScript thread: while a hash ran, no
 * other request was answered. A flood of sign-ins from many addresses, each
 * within its ten a minute, stalled everybody's requests.
 *
 * NOT bcryptjs's own async `hash`/`compare`. They split the rounds into chunks
 * of up to 100 ms (`MAX_EXECUTION_TIME`) and yield between them with
 * `setImmediate`, which Node runs once per turn of the event loop for every
 * callback queued before the turn began. So with eight hashes in flight each
 * turn runs eight chunks, about 800 ms, before the loop reads a socket again:
 * measured beside eight concurrent compares, a plain read waited 690–800 ms
 * with the async form, 290 ms with the sync one (the loop polls between two
 * whole hashes), and under 6 ms with a worker. So the work goes to up to
 * {@link DEFAULT_THREADS} worker threads, each running bcryptjs's sync form,
 * one job at a time; the event loop only posts the job and reads the answer.
 * Node's guidance says the same: "the Event Loop should orchestrate client
 * requests, not fulfill them itself".
 *
 * A worker is started when first needed, kept, and let go of (`unref`) while
 * idle, so it holds no process open. If no worker can be started, or one keeps
 * dying, the job runs on this thread with bcryptjs's async form: slower for
 * everybody else, never a failed sign-in.
 *
 * AT MOST {@link DEFAULT_THREADS} COMPARES AT ONCE, AND ONE ON THIS THREAD
 * (`found-30-sep/a-burst-is-compared-before-the-lock`). The lockout counts a
 * wrong password when its compare ends, so a burst sent at once is answered
 * only by the compares that end before the lock: at most the threshold and
 * the compares in flight beside the one that locks. The rest wait their turn
 * here and find the account locked. On this thread a compare runs alone too:
 * all at once, every compare of a burst ended together, after the loop had run
 * each of their chunks in turn, and none waited for the lock.
 */

/** The cost of every password hash the API makes: 2^12 rounds. */
export const PASSWORD_HASH_COST = 12

/**
 * WHAT A SIGN-IN COMPARES WHEN THERE IS NOTHING TO COMPARE
 * (`found-30-sep/sign-in-time-tells-an-account`).
 *
 * An email with no account, an account with no password (it signs in through
 * SSO or Google/Microsoft only) and a locked account were each answered
 * "Invalid credentials" before any hashing, in 15–30 ms; a real account's
 * wrong password after a compare, in 384–407 ms. The same words at two
 * speeds say whether an account exists. OWASP's authentication cheat sheet:
 * "The recommended code will go through the same process no matter what the
 * user or the password is, allowing the application to return in
 * approximately the same response time."
 *
 * So those answers compare the password with this: a hash at
 * {@link PASSWORD_HASH_COST} of 32 random bytes nobody kept, so it takes a
 * real account's time and matches nothing. What it answers is never read.
 */
export const NO_ACCOUNT_HASH = '$2b$12$gj0xZAp/j34YkjG5SpT3MOknobrzWU8VeW4ECGW9vYxqbwNVC1T.6'

/**
 * One thread fewer than the machine has, so the event loop keeps a core, and
 * at most four: a flood is then a queue of sign-ins, not every core busy.
 */
export const DEFAULT_THREADS = Math.max(1, Math.min(4, availableParallelism() - 1))

/*
 * The worker, as a script. Evaluated rather than loaded from a file, so the
 * same code runs from the build (`dist/…`), under tsx in the unit tests and in
 * CI: none of them has to find a compiled worker file beside this one.
 * bcryptjs is required by the absolute path this module resolved.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const bcrypt = require(workerData.bcryptjs)
parentPort.on('message', (job) => {
  let answer
  try {
    answer = { value: job.op === 'hash' ? bcrypt.hashSync(job.plain, job.cost) : bcrypt.compareSync(job.plain, job.hashed) }
  } catch (err) {
    answer = { error: String((err && err.message) || err) }
  }
  parentPort.postMessage(answer)
})
`
const BCRYPTJS = require.resolve('bcryptjs')

type Job =
  | { op: 'hash'; plain: string; cost: number; resolve: (value: string) => void; reject: (err: Error) => void }
  | { op: 'compare'; plain: string; hashed: string; resolve: (value: boolean) => void; reject: (err: Error) => void }

/** A worker that died this many times running, with no answer between, is not started again. */
const LOSSES_BEFORE_GIVING_UP = 3

export class PasswordHasher {
  private readonly logger = new Logger('PasswordHasher')
  private readonly live = new Set<Worker>()
  private readonly idle: Worker[] = []
  private readonly running = new Map<Worker, Job>()
  private readonly waiting: Job[] = []
  private lossesInARow = 0
  private workersUnavailable = false
  /** Jobs on this thread: one at a time, the rest in turn. */
  private hereRunning = 0
  private readonly hereWaiting: Job[] = []

  /** `threads` below one means no workers: every job on this thread. */
  constructor(private readonly threads = DEFAULT_THREADS) {
    if (threads < 1) this.workersUnavailable = true
  }

  /** A new hash of `plain`, at {@link PASSWORD_HASH_COST} unless a cost is named. */
  hash(plain: string, cost: number = PASSWORD_HASH_COST): Promise<string> {
    return new Promise((resolve, reject) => this.submit({ op: 'hash', plain, cost, resolve, reject }))
  }

  /** Whether `plain` is the password `hashed` was made from. */
  compare(plain: string, hashed: string): Promise<boolean> {
    return new Promise((resolve, reject) => this.submit({ op: 'compare', plain, hashed, resolve, reject }))
  }

  /**
   * Whether a stored hash was made at a lower cost than today's, and should be
   * made again the next time its password is known (at a sign-in). Changing a
   * password in the profile hashed at cost 10: such an account's wrong password
   * answered in a quarter of the time a missing account's does.
   */
  needsRehash(hashed: string): boolean {
    try {
      return getRounds(hashed) < PASSWORD_HASH_COST
    } catch {
      return false
    }
  }

  private submit(job: Job): void {
    const worker = this.idle.pop() ?? this.spawn()
    if (worker) this.start(worker, job)
    else if (this.workersUnavailable) this.onThisThread(job)
    else this.waiting.push(job)
  }

  private start(worker: Worker, job: Job): void {
    this.running.set(worker, job)
    // Held open while it has a job, so a script that awaits a hash is not left waiting on nothing.
    worker.ref()
    worker.postMessage(
      job.op === 'hash' ? { op: 'hash', plain: job.plain, cost: job.cost } : { op: 'compare', plain: job.plain, hashed: job.hashed },
    )
  }

  private answered(worker: Worker, answer: { value?: string | boolean; error?: string }): void {
    const job = this.running.get(worker)
    this.running.delete(worker)
    this.lossesInARow = 0
    if (job) {
      if (answer.error !== undefined) job.reject(new Error(answer.error))
      else (job.resolve as (value: unknown) => void)(answer.value)
    }
    const next = this.waiting.shift()
    if (next) this.start(worker, next)
    else {
      worker.unref()
      this.idle.push(worker)
    }
  }

  /** A worker that errored or exited: its job is done here, and the queue gets a new worker. */
  private lost(worker: Worker, why: string): void {
    if (!this.live.has(worker)) return
    this.live.delete(worker)
    const at = this.idle.indexOf(worker)
    if (at !== -1) this.idle.splice(at, 1)
    const job = this.running.get(worker)
    this.running.delete(worker)
    this.lossesInARow += 1
    if (this.lossesInARow >= LOSSES_BEFORE_GIVING_UP && !this.workersUnavailable) {
      this.workersUnavailable = true
      this.logger.error(`password hashing workers keep failing (${why}); hashing on the event loop from now on`)
    }
    // Here, not on another worker: if the job is what killed this one, it would kill the next.
    if (job) this.onThisThread(job)
    // The dead worker's place, for the first job still waiting; the rest wait for a busy one.
    while (this.waiting.length && !this.workersUnavailable) {
      const fresh = this.spawn()
      if (!fresh) break
      this.start(fresh, this.waiting.shift() as Job)
    }
    if (this.workersUnavailable) for (const next of this.waiting.splice(0)) this.onThisThread(next)
  }

  private spawn(): Worker | null {
    if (this.workersUnavailable || this.live.size >= this.threads) return null
    let worker: Worker
    try {
      // `execArgv: []`: the worker needs nothing but bcryptjs, not the loaders the API was started with.
      worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { bcryptjs: BCRYPTJS }, execArgv: [] })
    } catch (err) {
      this.workersUnavailable = true
      this.logger.error(`could not start a password hashing worker (${(err as Error).message}); hashing on the event loop`)
      return null
    }
    worker.on('message', (answer) => this.answered(worker, answer))
    worker.on('error', (err) => this.lost(worker, err.message))
    worker.on('exit', (code) => this.lost(worker, `exited with ${code}`))
    worker.unref()
    this.live.add(worker)
    return worker
  }

  /** bcryptjs's async form, on this thread: what is left when no worker can be had. One job at a time. */
  private onThisThread(job: Job): void {
    if (this.hereRunning > 0) {
      this.hereWaiting.push(job)
      return
    }
    this.hereRunning += 1
    const done = job.op === 'hash'
      ? hashOnThisThread(job.plain, job.cost).then(job.resolve, job.reject)
      : compareOnThisThread(job.plain, job.hashed).then(job.resolve, job.reject)
    void done.finally(() => {
      this.hereRunning -= 1
      const next = this.hereWaiting.shift()
      if (next) this.onThisThread(next)
    })
  }
}

/** The one hasher the API uses. */
export const passwords = new PasswordHasher()
