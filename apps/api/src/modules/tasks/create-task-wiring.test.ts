import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * §1.1 — every field the create DTO accepts has to reach the service.
 *
 * The POST /tasks handler builds its argument field by field rather than
 * spreading the body, which is the safe choice — it is why a client cannot
 * mass-assign columns. The cost is that adding a field to the DTO and honouring
 * it in the service is not enough: unless the field is also named in that
 * literal, it is accepted, validated, and dropped in between.
 *
 * That is exactly what happened to `taskTypeId`. The DTO took it, createTask
 * validated it against the list's workspace and wrote it, and choosing a type
 * at create time had never once worked on any deploy. Nothing errored. The task
 * simply came back with the workspace default.
 *
 * The deploy check missed it too, because it created its probe type with
 * isDefault:true — so the task picked that same type up as the default and the
 * assertion passed without the field ever crossing the wire.
 *
 * This compares the two lists directly, so the next field added to the DTO
 * cannot go missing quietly.
 */

function workspaceRoot(from: string): string {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = dirname(dir)
    if (up === dir) throw new Error('workspace root not found')
    dir = up
  }
}
const repo = workspaceRoot(process.cwd())
const read = (rel: string) => readFileSync(join(repo, rel), 'utf8')

describe('POST /tasks forwards every field it accepts (§1.1)', () => {
  const dto = read('apps/api/src/modules/tasks/dto/task.dto.ts')
  const controller = read('apps/api/src/modules/tasks/tasks.controller.ts')

  const dtoFields = (() => {
    const body = dto.slice(dto.indexOf('export class CreateTaskDto'))
    return new Set([...body.slice(0, body.indexOf('\n}')).matchAll(/^ {2}(\w+)[?!]?:/gm)].map((m) => m[1]))
  })()

  const forwarded = (() => {
    const call = controller.slice(controller.indexOf('return this.tasks.createTask({'))
    return new Set([...call.slice(0, call.indexOf('})')).matchAll(/^\s+(\w+):/gm)].map((m) => m[1]))
  })()

  it('names every DTO field in the createTask call', () => {
    const dropped = [...dtoFields].filter((f) => !forwarded.has(f))
    assert.deepEqual(
      dropped,
      [],
      `accepted by the DTO and never passed on: ${dropped.join(', ')}`,
    )
  })

  it('still forwards taskTypeId, the one this was written for', () => {
    assert.ok(forwarded.has('taskTypeId'))
    assert.ok(dtoFields.has('taskTypeId'))
  })

  it('and the deploy check uses a non-default type, or it proves nothing', () => {
    // A probe type created with isDefault:true is indistinguishable from the
    // field being dropped, because the task acquires it either way.
    const verify = read('deploy/verify-release.sh')
    const probe = verify.slice(verify.indexOf('"name":"Deploy check"'))
    assert.ok(
      !probe.slice(0, 120).includes('isDefault'),
      'the probe type must not be the workspace default',
    )
  })
})
