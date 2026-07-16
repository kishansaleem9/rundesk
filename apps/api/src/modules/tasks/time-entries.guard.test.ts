import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TaskTimeEntriesController } from './time-entries.controller'
import { NotGuestGuard } from '../../common/guards/not-guest.guard'

/**
 * §3.3 — time tracking is a member capability. Guests may read entries but must
 * not start/stop a timer or log manual time. `NotGuestGuard` is bound (on top of
 * the class-level JwtAuthGuard + ResourceMemberGuard) to the mutation handlers
 * only; the read handler stays open to guests.
 *
 * We assert the wiring via the metadata NestJS's `@UseGuards` writes onto each
 * handler, so a future refactor that drops the guard fails loudly here.
 */
const guardsOn = (method: string): unknown[] =>
  (Reflect.getMetadata('__guards__', (TaskTimeEntriesController.prototype as any)[method]) ?? []) as unknown[]

describe('TaskTimeEntriesController — NotGuestGuard on mutations (§3.3)', () => {
  for (const method of ['start', 'stop', 'manual']) {
    it(`guards ${method}() against guests`, () => {
      assert.ok(
        guardsOn(method).includes(NotGuestGuard),
        `${method}() must be protected by NotGuestGuard`,
      )
    })
  }

  it('leaves the read handler (list) open to guests', () => {
    assert.equal(
      guardsOn('list').includes(NotGuestGuard),
      false,
      'list() is a read endpoint and must not gain NotGuestGuard',
    )
  })
})
