import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import {
  supportTickets,
  supportTicketMessages,
  statusComponents,
  statusIncidents,
  workspaceMembers,
} from '@rundesk/db'
import { SupportService } from './support.service'
import {
  computeSlaDueDates,
  computeSlaBreach,
  SLA_POLICY,
  SLA_MATRIX,
  TICKET_PRIORITIES,
} from './support.constants'

/**
 * A PlansService double. SupportService resolves the workspace plan to gate
 * ticket creation (paid-only, §14.4) and to scale SLA clocks by tier. Defaults
 * to 'pro' — whose SLA equals the legacy priority-only policy — so pre-existing
 * priority tests keep their expected values.
 */
const plansMock = (id = 'pro') => ({
  getWorkspacePlan: async () => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }),
}) as any

/**
 * A drizzle-shaped fake DB. `selectRows(table)` answers each `.from(table)`;
 * inserts (with `.returning()`) echo the written values plus a generated id;
 * updates capture their `set` patch for assertions. No Postgres is touched.
 */
function makeDb(selectRows: (table: unknown) => any[] = () => []) {
  const inserts: Array<{ table: unknown; values: any }> = []
  const updates: Array<{ table: unknown; set: any }> = []
  const deletes: Array<{ table: unknown }> = []
  const db: any = {
    select: (_cols?: unknown) => {
      const chain: any = { _table: null }
      chain.from = (t: unknown) => { chain._table = t; return chain }
      chain.leftJoin = () => chain
      chain.where = () => chain
      chain.orderBy = () => chain
      chain.limit = () => chain
      chain.then = (res: any, rej: any) => Promise.resolve(selectRows(chain._table)).then(res, rej)
      return chain
    },
    insert: (table: unknown) => ({
      values: (values: any) => {
        const rec = { table, values }
        const row = Array.isArray(values) ? values : { id: values.id ?? 'generated-id', ...values }
        return {
          returning: () => { inserts.push(rec); return Promise.resolve([row]) },
          then: (res: any, rej: any) => { inserts.push(rec); return Promise.resolve().then(res, rej) },
        }
      },
    }),
    update: (table: unknown) => ({
      set: (set: any) => {
        updates.push({ table, set })
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: 'updated-id', ...set }]),
            then: (res: any, rej: any) => Promise.resolve().then(res, rej),
          }),
        }
      },
    }),
    delete: (table: unknown) => ({
      where: () => { deletes.push({ table }); return Promise.resolve() },
    }),
  }
  return { db, inserts, updates, deletes }
}

// --- SLA due-date policy ------------------------------------------------------
describe('SupportService — ticket create sets SLA due dates by priority', () => {
  it('stamps first-response + resolution due dates from the priority policy', async () => {
    const { db, inserts } = makeDb((t) => (t === workspaceMembers ? [{ id: 'm1' }] : []))
    const svc = new SupportService(db, plansMock())
    const before = Date.now()
    const ticket = await svc.createTicket(
      { id: 'u1', role: 'member' },
      { workspaceId: 'ws1', subject: 'Help', body: 'Broken', priority: 'urgent' },
    )
    const after = Date.now()

    const ins = inserts.find((i) => i.table === supportTickets)!
    assert.ok(ins, 'inserted a ticket row')
    const fr = new Date(ins.values.firstResponseDueAt).getTime()
    const res = new Date(ins.values.resolutionDueAt).getTime()
    // urgent → 4h first response, 24h resolution.
    assert.ok(fr >= before + SLA_POLICY.urgent.firstResponseHours * 3600_000)
    assert.ok(fr <= after + SLA_POLICY.urgent.firstResponseHours * 3600_000)
    assert.ok(res >= before + SLA_POLICY.urgent.resolutionHours * 3600_000)
    assert.ok(res <= after + SLA_POLICY.urgent.resolutionHours * 3600_000)
    assert.equal(ticket.priority, 'urgent')
    assert.equal(ticket.status, 'open')
    // The opening message is seeded into the thread.
    assert.ok(inserts.some((i) => i.table === supportTicketMessages))
  })

  it('computeSlaDueDates matches the policy for every priority', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    for (const priority of ['low', 'normal', 'high', 'urgent'] as const) {
      const { firstResponseDueAt, resolutionDueAt } = computeSlaDueDates(priority, from)
      assert.equal(
        firstResponseDueAt.getTime(),
        from.getTime() + SLA_POLICY[priority].firstResponseHours * 3600_000,
      )
      assert.equal(
        resolutionDueAt.getTime(),
        from.getTime() + SLA_POLICY[priority].resolutionHours * 3600_000,
      )
    }
  })

  it('defaults an unknown priority to normal', async () => {
    const { db, inserts } = makeDb((t) => (t === workspaceMembers ? [{ id: 'm1' }] : []))
    const svc = new SupportService(db, plansMock())
    const ticket = await svc.createTicket(
      { id: 'u1', role: 'member' },
      { workspaceId: 'ws1', subject: 'X', priority: 'nonsense' },
    )
    assert.equal(ticket.priority, 'normal')
    assert.ok(inserts.some((i) => i.table === supportTickets))
  })
})

// --- Staff reply stamps first_response ---------------------------------------
describe('SupportService — staff reply stamps first_response_at', () => {
  const ticketRow = {
    id: 't1',
    workspaceId: 'ws1',
    createdById: 'requester',
    subject: 'S',
    body: 'B',
    status: 'open',
    priority: 'normal',
    assignedToId: null,
    firstResponseAt: null,
    resolvedAt: null,
    firstResponseDueAt: new Date(Date.now() + 3600_000),
    resolutionDueAt: new Date(Date.now() + 10 * 3600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('a staff reply sets first_response_at when unset and moves open→pending', async () => {
    const { db, updates } = makeDb((t) => {
      if (t === supportTickets) return [ticketRow]
      if (t === workspaceMembers) return [{ role: 'workspace_admin' }]
      return []
    })
    const svc = new SupportService(db, plansMock())
    await svc.addMessage({ id: 'staff1', role: 'member' }, 't1', { body: 'Looking into it' })

    const patch = updates.find((u) => u.table === supportTickets)!.set
    assert.ok(patch.firstResponseAt instanceof Date, 'first_response_at stamped')
    assert.equal(patch.status, 'pending')
  })

  it('a requester reply does NOT stamp first_response_at', async () => {
    const { db, updates } = makeDb((t) => {
      if (t === supportTickets) return [ticketRow]
      if (t === workspaceMembers) return [] // requester is not staff
      return []
    })
    const svc = new SupportService(db, plansMock())
    // The requester is the ticket creator, so access is allowed.
    await svc.addMessage({ id: 'requester', role: 'member' }, 't1', { body: 'Still broken' })
    const patch = updates.find((u) => u.table === supportTickets)!.set
    assert.equal(patch.firstResponseAt, undefined)
  })
})

// --- SLA-breach computation ---------------------------------------------------
describe('SupportService — SLA breach computation', () => {
  it('flags a first-response breach when overdue with no response', () => {
    const flags = computeSlaBreach({
      status: 'open',
      firstResponseAt: null,
      resolvedAt: null,
      firstResponseDueAt: new Date(Date.now() - 3600_000), // 1h ago
      resolutionDueAt: new Date(Date.now() + 3600_000),
    })
    assert.equal(flags.firstResponseBreached, true)
    assert.equal(flags.resolutionBreached, false)
    assert.equal(flags.breached, true)
  })

  it('does not flag first-response breach once answered', () => {
    const flags = computeSlaBreach({
      status: 'pending',
      firstResponseAt: new Date(Date.now() - 60_000),
      resolvedAt: null,
      firstResponseDueAt: new Date(Date.now() - 3600_000),
      resolutionDueAt: new Date(Date.now() + 3600_000),
    })
    assert.equal(flags.firstResponseBreached, false)
  })

  it('flags a resolution breach when overdue and unresolved', () => {
    const flags = computeSlaBreach({
      status: 'open',
      firstResponseAt: new Date(),
      resolvedAt: null,
      firstResponseDueAt: new Date(Date.now() - 5 * 3600_000),
      resolutionDueAt: new Date(Date.now() - 3600_000),
    })
    assert.equal(flags.resolutionBreached, true)
    assert.equal(flags.breached, true)
  })

  it('a resolved ticket never reports a resolution breach', () => {
    const flags = computeSlaBreach({
      status: 'resolved',
      firstResponseAt: new Date(Date.now() - 5 * 3600_000),
      resolvedAt: new Date(Date.now() - 60_000),
      firstResponseDueAt: new Date(Date.now() - 6 * 3600_000),
      resolutionDueAt: new Date(Date.now() - 3600_000),
    })
    assert.equal(flags.resolutionBreached, false)
    assert.equal(flags.firstResponseBreached, false)
    assert.equal(flags.breached, false)
  })

  it('createTicket read exposes slaBreached flags', async () => {
    const { db } = makeDb((t) => (t === workspaceMembers ? [{ id: 'm1' }] : []))
    const svc = new SupportService(db, plansMock())
    const ticket = await svc.createTicket(
      { id: 'u1', role: 'member' },
      { workspaceId: 'ws1', subject: 'X', priority: 'normal' },
    )
    assert.equal(ticket.slaBreached, false)
    assert.equal(typeof ticket.firstResponseBreached, 'boolean')
    assert.equal(typeof ticket.resolutionBreached, 'boolean')
  })
})

// --- Status page shape --------------------------------------------------------
describe('SupportService — status page shape', () => {
  it('returns { overall, components, incidents } and derives overall from worst state', async () => {
    const { db } = makeDb((t) => {
      if (t === statusComponents) {
        return [
          { id: 'c1', name: 'API', status: 'operational', position: 0 },
          { id: 'c2', name: 'Web', status: 'partial_outage', position: 1 },
        ]
      }
      if (t === statusIncidents) {
        return [{ id: 'i1', title: 'Latency', status: 'investigating', impact: 'minor' }]
      }
      return []
    })
    const svc = new SupportService(db, plansMock())
    const page = await svc.getStatusPage()
    assert.ok(Array.isArray(page.components))
    assert.ok(Array.isArray(page.incidents))
    assert.equal(page.components.length, 2)
    assert.equal(page.incidents.length, 1)
    // Worst component is partial_outage → overall partial_outage.
    assert.equal(page.overall, 'partial_outage')
  })

  it('is operational when every component is operational and no open incidents', async () => {
    const { db } = makeDb((t) => {
      if (t === statusComponents) return [{ id: 'c1', name: 'API', status: 'operational', position: 0 }]
      if (t === statusIncidents) return []
      return []
    })
    const svc = new SupportService(db, plansMock())
    const page = await svc.getStatusPage()
    assert.equal(page.overall, 'operational')
  })

  it('is degraded when an incident is open even if components are operational', async () => {
    const { db } = makeDb((t) => {
      if (t === statusComponents) return [{ id: 'c1', name: 'API', status: 'operational', position: 0 }]
      if (t === statusIncidents) return [{ id: 'i1', title: 'Blip', status: 'monitoring', impact: 'minor' }]
      return []
    })
    const svc = new SupportService(db, plansMock())
    const page = await svc.getStatusPage()
    assert.equal(page.overall, 'degraded')
  })
})

// --- Access control -----------------------------------------------------------
describe('SupportService — ticket access control', () => {
  const foreignTicket = {
    id: 't9',
    workspaceId: 'ws1',
    createdById: 'someone-else',
    subject: 'Private',
    body: 'B',
    status: 'open',
    priority: 'normal',
    assignedToId: null,
    firstResponseAt: null,
    resolvedAt: null,
    firstResponseDueAt: new Date(),
    resolutionDueAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it("a non-creator, non-admin cannot read another user's ticket", async () => {
    const { db } = makeDb((t) => {
      if (t === supportTickets) return [foreignTicket]
      if (t === workspaceMembers) return [] // not a member/staff of the workspace
      return []
    })
    const svc = new SupportService(db, plansMock())
    await assert.rejects(
      () => svc.getTicket({ id: 'intruder', role: 'member' }, 't9'),
      (err: unknown) => err instanceof ForbiddenException,
    )
  })

  it('the creator can read their own ticket', async () => {
    const { db } = makeDb((t) => {
      if (t === supportTickets) return [foreignTicket]
      if (t === supportTicketMessages) return []
      return []
    })
    const svc = new SupportService(db, plansMock())
    const res = await svc.getTicket({ id: 'someone-else', role: 'member' }, 't9')
    assert.equal(res.id, 't9')
    assert.ok(Array.isArray(res.messages))
  })

  it('a super_admin can read any ticket', async () => {
    const { db } = makeDb((t) => {
      if (t === supportTickets) return [foreignTicket]
      if (t === supportTicketMessages) return []
      return []
    })
    const svc = new SupportService(db, plansMock())
    const res = await svc.getTicket({ id: 'admin', role: 'super_admin' }, 't9')
    assert.equal(res.id, 't9')
  })

  it('a plain requester cannot update ticket status', async () => {
    const { db } = makeDb((t) => {
      if (t === supportTickets) return [foreignTicket]
      if (t === workspaceMembers) return []
      return []
    })
    const svc = new SupportService(db, plansMock())
    await assert.rejects(
      () => svc.updateTicket({ id: 'someone-else', role: 'member' }, 't9', { status: 'resolved' }),
      (err: unknown) => err instanceof ForbiddenException,
    )
  })

  it('super_admin-only status component management rejects non-admins', async () => {
    const { db } = makeDb()
    const svc = new SupportService(db, plansMock())
    await assert.rejects(
      () => svc.createComponent({ id: 'u1', role: 'member' }, { name: 'API' }),
      (err: unknown) => err instanceof ForbiddenException,
    )
  })
})

// --- SLA commitments BY TIER × priority (§14.4) -------------------------------
describe('SupportService — SLA by tier × priority', () => {
  it('SLA_MATRIX is strictly tighter for higher tiers at every priority', () => {
    for (const priority of TICKET_PRIORITIES) {
      const e = SLA_MATRIX.enterprise[priority]
      const b = SLA_MATRIX.business[priority]
      const p = SLA_MATRIX.pro[priority]
      const f = SLA_MATRIX.free[priority]
      // enterprise < business < pro < free on both clocks.
      assert.ok(e.firstResponseHours < b.firstResponseHours, `${priority} FR ent<biz`)
      assert.ok(b.firstResponseHours < p.firstResponseHours, `${priority} FR biz<pro`)
      assert.ok(p.firstResponseHours < f.firstResponseHours, `${priority} FR pro<free`)
      assert.ok(e.resolutionHours < b.resolutionHours, `${priority} RES ent<biz`)
      assert.ok(b.resolutionHours < p.resolutionHours, `${priority} RES biz<pro`)
      assert.ok(p.resolutionHours < f.resolutionHours, `${priority} RES pro<free`)
    }
  })

  it('computeSlaDueDates scales by tier (enterprise urgent 1h/8h vs free 8h/48h)', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    const ent = computeSlaDueDates('urgent', from, 'enterprise')
    const free = computeSlaDueDates('urgent', from, 'free')
    assert.equal(ent.firstResponseDueAt.getTime(), from.getTime() + 1 * 3600_000)
    assert.equal(ent.resolutionDueAt.getTime(), from.getTime() + 8 * 3600_000)
    assert.equal(free.firstResponseDueAt.getTime(), from.getTime() + 8 * 3600_000)
    assert.equal(free.resolutionDueAt.getTime(), from.getTime() + 48 * 3600_000)
    assert.ok(ent.resolutionDueAt.getTime() < free.resolutionDueAt.getTime())
  })

  it('an unknown/omitted tier falls back to the legacy priority-only policy', () => {
    const from = new Date('2026-01-01T00:00:00.000Z')
    for (const priority of TICKET_PRIORITIES) {
      const omitted = computeSlaDueDates(priority, from)
      const unknown = computeSlaDueDates(priority, from, 'platinum')
      const baseFr = from.getTime() + SLA_POLICY[priority].firstResponseHours * 3600_000
      const baseRes = from.getTime() + SLA_POLICY[priority].resolutionHours * 3600_000
      assert.equal(omitted.firstResponseDueAt.getTime(), baseFr)
      assert.equal(omitted.resolutionDueAt.getTime(), baseRes)
      assert.equal(unknown.firstResponseDueAt.getTime(), baseFr)
      assert.equal(unknown.resolutionDueAt.getTime(), baseRes)
    }
  })

  it('createTicket stamps the tier-scaled SLA (enterprise urgent = 1h/8h)', async () => {
    const { db, inserts } = makeDb((t) => (t === workspaceMembers ? [{ id: 'm1' }] : []))
    const svc = new SupportService(db, plansMock('enterprise'))
    const before = Date.now()
    await svc.createTicket(
      { id: 'u1', role: 'member' },
      { workspaceId: 'ws1', subject: 'Outage', priority: 'urgent' },
    )
    const after = Date.now()
    const ins = inserts.find((i) => i.table === supportTickets)!
    const fr = new Date(ins.values.firstResponseDueAt).getTime()
    const res = new Date(ins.values.resolutionDueAt).getTime()
    assert.ok(fr >= before + 1 * 3600_000 && fr <= after + 1 * 3600_000, 'enterprise FR = 1h')
    assert.ok(res >= before + 8 * 3600_000 && res <= after + 8 * 3600_000, 'enterprise resolution = 8h')
  })
})

// --- Ticket system is paid-only (§14.4) --------------------------------------
describe('SupportService — ticket creation gated to paid tiers', () => {
  it('a Free workspace is turned away with a 403 upgrade prompt (nothing written)', async () => {
    const { db, inserts } = makeDb((t) => (t === workspaceMembers ? [{ id: 'm1' }] : []))
    const svc = new SupportService(db, plansMock('free'))
    await assert.rejects(
      () => svc.createTicket({ id: 'u1', role: 'member' }, { workspaceId: 'ws1', subject: 'Help' }),
      (err: unknown) => err instanceof ForbiddenException && /upgrade/i.test((err as Error).message),
    )
    assert.equal(inserts.some((i) => i.table === supportTickets), false, 'no ticket row written')
  })

  it('a Pro workspace can open a ticket', async () => {
    const { db, inserts } = makeDb((t) => (t === workspaceMembers ? [{ id: 'm1' }] : []))
    const svc = new SupportService(db, plansMock('pro'))
    const ticket = await svc.createTicket(
      { id: 'u1', role: 'member' },
      { workspaceId: 'ws1', subject: 'Help' },
    )
    assert.equal(ticket.status, 'open')
    assert.ok(inserts.some((i) => i.table === supportTickets))
  })

  it('super_admin can file into a Free workspace (platform-staff bypass)', async () => {
    const { db, inserts } = makeDb(() => [])
    const svc = new SupportService(db, plansMock('free'))
    const ticket = await svc.createTicket(
      { id: 'sa', role: 'super_admin' },
      { workspaceId: 'ws1', subject: 'On behalf of the customer' },
    )
    assert.equal(ticket.status, 'open')
    assert.ok(inserts.some((i) => i.table === supportTickets))
  })
})
