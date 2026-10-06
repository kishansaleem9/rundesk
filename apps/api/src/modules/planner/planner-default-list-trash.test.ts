import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PlannerService } from './planner.service'

/*
 * THE PLANNER'S SETTINGS SAY WHEN THE CHOSEN DEFAULT LIST IS IN THIS
 * WORKSPACE'S TRASH (`found-5-oct/default-list-files-into-an-archived-list`) —
 * the one case in which `/task`, a chat message and the AI refuse and send the
 * person to the picker, which showed "The first list I can add to" as chosen
 * while the server held the deleted list. Asked as `defaultListFor` asks it: the
 * list's workspace, then the create gate. A queued Drizzle stand-in answers the
 * selects in the order they are asked: the person's settings, the list's
 * workspace, then the gate's (the list's home, the account, the read rule's).
 */
function service(selects: unknown[][]) {
  const queue = [...selects]
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) p[v] = () => p
    return p
  }
  const db = { select: () => node(queue.shift() ?? []) } as any
  return { svc: new PlannerService(db, {} as any, {} as any), left: () => queue.length }
}

const LIST = '55555555-5555-4555-8555-555555555555'
const SETTINGS = [{ settings: { defaultListId: LIST }, weekStart: 'monday', timezone: 'UTC' }]
const HOME = (inTrash: boolean) => [{ workspaceId: 'w1', spaceId: 's1', projectId: 'p1', folderId: null, inTrash, deletedById: 'the-admin' }]
const LIST_ROW = (listVisibility: string) => [{ listId: LIST, listVisibility, listCreatedById: 'the-admin', projectId: 'p1', projectVisibility: 'public', spaceId: 's1', spaceVisibility: 'public' }]

describe('PlannerService.getSettings — the chosen Default list in the trash', () => {
  it('says so when the list is this workspace’s and the create gate refuses it for being in the trash', async () => {
    const { svc, left } = service([SETTINGS, [{ workspaceId: 'w1' }], HOME(true), [{ role: 'member' }], LIST_ROW('public'), [{ role: 'member' }], []])
    const out = await svc.getSettings('m', 'w1')
    assert.equal(out.defaultListInTrash, true)
    assert.equal(left(), 0)
  })

  it('does not for a list of another workspace, which /task passes over there', async () => {
    const { svc } = service([SETTINGS, [{ workspaceId: 'w2' }]])
    const out = await svc.getSettings('m', 'w1')
    assert.equal(out.defaultListInTrash, false)
  })

  it('nor for one the person may no longer open, which /task passes over too', async () => {
    const { svc } = service([SETTINGS, [{ workspaceId: 'w1' }], HOME(true), [{ role: 'member' }], LIST_ROW('private'), [{ role: 'member' }], []])
    const out = await svc.getSettings('m', 'w1')
    assert.equal(out.defaultListInTrash, false)
  })

  it('and says nothing of it when the settings are read for themselves, with no workspace beside them', async () => {
    const { svc } = service([SETTINGS])
    const out = await svc.getSettings('m')
    assert.equal('defaultListInTrash' in out, false)
  })
})
