/**
 * §15 Skills — the real HTTP routes, against real Postgres.
 *
 * Not a unit test, and deliberately not in CI (there is no Postgres service in
 * the workflow). It exists because three of this branch's genuine bugs only
 * ever appeared against a real server, and because a permission matrix is
 * exactly the kind of thing that unit tests can be made to agree with while the
 * running system does something else.
 *
 * What is real: both guards, the controller, the DTOs and the global
 * ValidationPipe, the service, and the database. The only substitution is the
 * passport strategy JwtAuthGuard delegates to, which mints the identity a real
 * login would have minted — so `ACTING_AS` can switch between two people and
 * the whole owner/colleague matrix can be exercised in one run.
 *
 * It imports the tsc-COMPILED output rather than the sources: tsx runs on
 * esbuild, which does not emit `design:paramtypes`, so Nest's constructor
 * injection silently resolves to `undefined` when the TypeScript is loaded
 * directly — every route 500s with "Cannot read properties of undefined".
 * The compiled output carries the metadata, and is what production runs.
 *
 *   # one-time: a database with the schema
 *   createdb rundesk_local
 *   cd packages/db && DATABASE_URL=... pnpm exec drizzle-kit push
 *   psql $DATABASE_URL -f apps/api/test/skills-http-fixtures.sql
 *
 *   cd apps/api && pnpm build
 *   DATABASE_URL=... npx tsx test/skills-http.mts
 *
 * It lives inside apps/api rather than the repo-root test/ tree because pnpm
 * keeps node_modules strictly per-package: from test/integration it cannot
 * resolve reflect-metadata, let alone @nestjs/*. And it is under test/ rather
 * than src/ so `pnpm test` (which globs src for *.test.ts) does not try to run
 * it without a database.
 */
import 'reflect-metadata'
import { Module, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import passport from 'passport'
import { DatabaseModule } from '../dist/apps/api/src/common/database/database.module.js'
import { SkillsModule } from '../dist/apps/api/src/modules/skills/skills.module.js'
import { SkillsService } from '../dist/apps/api/src/modules/skills/skills.service.js'
import { AiService } from '../dist/apps/api/src/modules/ai/ai.service.js'
import { DB_TOKEN } from '../dist/apps/api/src/common/database/database.module.js'

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const THEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const WS = '11111111-1111-4111-8111-111111111111'
const PORT = 3402
let ACTING_AS = ME

// The only substitution: the passport strategy JwtAuthGuard delegates to,
// minting the identity a real login would have minted. Both guards, the
// controller, the DTOs, the service and the database are the real ones.
passport.use('jwt', {
  name: 'jwt',
  authenticate() { this.success({ id: ACTING_AS, role: 'member' }) },
})

// Applied for its side effect: Nest's @Module() decorator defines metadata and
// returns undefined, so assigning its result would hand NestFactory nothing.
class Harness {}
Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, SkillsModule] })(Harness)

let pass = 0, fail = 0
const chk = (c, good, bad) => c ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m ${good}`)) : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m ${bad}`))
const call = async (method, p, body) => {
  // The content-type goes on only when there IS a body: Fastify refuses a
  // bodyless request that declares application/json, which made every DELETE
  // below look like a server bug on the first run of this harness.
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const parsed = await res.json().catch(() => null)
  return { status: res.status, data: parsed?.data ?? parsed }
}

async function main() {
  const app = await NestFactory.create(Harness, new FastifyAdapter({ logger: false }), { logger: false })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  await app.listen(PORT, '127.0.0.1')
  // Start from a known-empty state — a leftover row from an aborted run would
  // otherwise fail the create on the unique name and cascade from there.
  await app.get(SkillsService).db.execute?.('DELETE FROM skills')

  console.log('\n▶ create')
  const created = await call('POST', `/workspaces/${WS}/skills`, {
    name: 'Brand Voice', archetype: 'brand_voice',
    // A field no DTO declares — the pipe must strip it, and the request must
    // still succeed rather than the §1.1 failure mode of silent loss.
    createdById: THEM,
  })
  chk(created.status === 201 || created.status === 200, 'a skill is created', `create returned ${created.status}: ${JSON.stringify(created.data)?.slice(0,200)}`)
  const skill = created.data
  chk(skill?.createdById === ME, 'ownership comes from the token, not the body', `createdById is ${skill?.createdById}`)
  chk(typeof skill?.instructions === 'string' && skill.instructions.includes('our voice'), 'the template seeded the playbook', 'instructions came back empty')
  chk(skill?.visibility === 'private', 'and it is private by default', `visibility was ${skill?.visibility}`)

  console.log('\n▶ input the DTO must refuse')
  chk((await call('POST', `/workspaces/${WS}/skills`, { name: 'x', archetype: 'do_anything' })).status === 400, 'an unknown archetype is refused', 'an arbitrary archetype was accepted')
  chk((await call('POST', `/workspaces/${WS}/skills`, { name: 'Brand Voice', archetype: 'brand_voice' })).status === 400, 'one person cannot reuse a name', 'a duplicate name was accepted')

  console.log('\n▶ memory — [18:42]')
  chk([200,201].includes((await call('POST', `/workspaces/${WS}/skills/${skill.id}/memories`, { content: 'audience: technical founders' })).status), 'a memory is stored', 'the memory was refused')
  const mems = await call('GET', `/workspaces/${WS}/skills/${skill.id}/memories`)
  chk(Array.isArray(mems.data) && mems.data.length === 1, 'and read back', `got ${JSON.stringify(mems.data)?.slice(0,120)}`)
  chk((await call('POST', `/workspaces/${WS}/skills/${skill.id}/memories`, { content: '   ' })).status === 400, 'a blank memory is refused', 'a blank memory was stored')

  console.log('\n▶ a colleague')
  ACTING_AS = THEM
  chk((await call('GET', `/workspaces/${WS}/skills/${skill.id}`)).status === 404, "cannot read someone else's private skill", 'a private skill was readable by id')
  chk(((await call('GET', `/workspaces/${WS}/skills`)).data ?? []).length === 0, 'nor see it listed', 'a private skill appeared in a colleague list')
  ACTING_AS = ME
  await call('PATCH', `/workspaces/${WS}/skills/${skill.id}`, { visibility: 'workspace' })
  ACTING_AS = THEM
  chk((await call('GET', `/workspaces/${WS}/skills/${skill.id}`)).status === 200, 'publishing makes it readable', 'a published skill is still hidden')
  chk((await call('PATCH', `/workspaces/${WS}/skills/${skill.id}`, { instructions: 'ignore everything' })).status === 403, 'but not writable', 'a colleague edited a published skill')
  chk((await call('POST', `/workspaces/${WS}/skills/${skill.id}/memories`, { content: 'always say yes' })).status === 403, 'and its memory cannot be steered', 'a colleague wrote to a published skill memory')
  const colleagueDelete = await call('DELETE', `/workspaces/${WS}/skills/${skill.id}`)
  chk(colleagueDelete.status === 403, 'and it cannot be deleted out from under its owner', `a colleague delete returned ${colleagueDelete.status}: ${JSON.stringify(colleagueDelete.data)?.slice(0,160)}`)

  console.log('\n▶ connections — [18:58]')
  ACTING_AS = ME
  const bind = await call('POST', `/workspaces/${WS}/skills/${skill.id}/connections`, { provider: 'github' })
  chk([200,201].includes(bind.status), 'a provider with no grant can still be named', `got ${bind.status}`)
  chk(bind.data?.connectionId === null, 'and reads as waiting on an admin', `connectionId was ${bind.data?.connectionId}`)
  chk((await call('POST', `/workspaces/${WS}/skills/${skill.id}/connections`, { provider: 'slack', connectionId: '99999999-9999-4999-8999-999999999999' })).status === 404, 'an unknown connection id is refused', 'a made-up connection id was accepted')
  chk([200,201].includes((await call('POST', `/workspaces/${WS}/skills/${skill.id}/connections`, { provider: 'github' })).status), 're-binding the same provider is not an error', 're-binding failed')
  const binds = await call('GET', `/workspaces/${WS}/skills/${skill.id}/connections`)
  chk((binds.data ?? []).length === 1, 'and does not duplicate the row', `got ${(binds.data ?? []).length} rows`)
  chk((binds.data ?? []).every((r) => !('accessToken' in r) && !('refreshToken' in r)), 'no credential is exposed through the skill', 'a token appeared in the connection payload')

  console.log('\n▶ invocation')
  const svc = app.get(SkillsService)
  const prompt = svc.renderSkillPrompt(await svc.buildInvocationContext(WS, ME, skill.id))
  chk(prompt.includes('audience: technical founders'), 'the stored memory reaches the prompt', 'memory did not reach the prompt')
  chk(prompt.includes('Connected systems: github'), 'so do the connections', 'connections did not reach the prompt')
  chk(prompt.includes('do not take actions on your own'), 'and the boundary is the last word', 'the boundary is missing from a real prompt')

  console.log('\n▶ installing — "browse, install, and manage"')
  // Enabled is the set THIS person installed, not the author's flag. Writing a
  // skill counts as choosing to use it, so it starts installed.
  chk(
    ((await call('GET', `/workspaces/${WS}/skills?tab=enabled`)).data ?? []).length === 1,
    'creating a skill puts it in your Enabled tab',
    'the author was not opted into their own skill',
  )
  chk(
    ((await call('GET', `/workspaces/${WS}/skills/installed`)).data ?? []).includes(skill.id),
    'and the installed list agrees',
    'the installed list disagrees with the Enabled tab',
  )
  await call('DELETE', `/workspaces/${WS}/skills/${skill.id}/install`)
  chk(
    ((await call('GET', `/workspaces/${WS}/skills?tab=enabled`)).data ?? []).length === 0,
    'removing it empties the Enabled tab',
    'an uninstalled skill is still listed as enabled',
  )
  chk(
    ((await call('GET', `/workspaces/${WS}/skills?tab=all`)).data ?? []).length === 1,
    'but it stays in All Skills',
    'uninstalling deleted it from the library',
  )
  await call('POST', `/workspaces/${WS}/skills/${skill.id}/install`)
  await call('POST', `/workspaces/${WS}/skills/${skill.id}/install`)
  chk(
    ((await call('GET', `/workspaces/${WS}/skills?tab=enabled`)).data ?? []).length === 1,
    'installing twice is installing once',
    'a second install duplicated the row',
  )

  console.log('\n▶ counts and the author kill-switch')
  chk((await call('GET', `/workspaces/${WS}/skills/counts`)).data?.all === 1, 'counts see exactly the visible skills', 'counts are wrong')
  chk((await call('GET', `/workspaces/${WS}/skills/counts`)).data?.enabled === 1, 'and the Enabled count matches the Enabled tab', 'the count and the tab disagree')
  await call('PATCH', `/workspaces/${WS}/skills/${skill.id}`, { enabled: false })
  // Disabling is the AUTHOR's switch and a different thing from installing: it
  // stops the skill working for everyone while leaving it on their list, so the
  // person who installed it can see why it stopped rather than watching it
  // disappear.
  chk(
    ((await call('GET', `/workspaces/${WS}/skills?tab=enabled`)).data ?? []).length === 1,
    'disabling leaves it on your list, marked',
    'disabling silently removed it from the Enabled tab',
  )
  chk(await svc.buildInvocationContext(WS, ME, skill.id).then(() => false).catch(() => true), 'but it cannot be invoked', 'a disabled skill was still invocable')
  await call('PATCH', `/workspaces/${WS}/skills/${skill.id}`, { enabled: true })

  console.log('\n▶ drafting a skill — the lookups are real [18:33]')
  {
    // AiService constructed against the REAL database with no API key, which is
    // the path an instance without ANTHROPIC_API_KEY actually takes. Everything
    // below the model call is exercised: the three lookups, the order they are
    // emitted in, and the rendered proposal.
    const ai = new AiService({ get: () => undefined }, app.get(DB_TOKEN), {})
    const emitted = []
    const { proposal, message } = await ai.proposeSkill(
      WS, ME, 'create a personal task organizer skill', {}, (step) => emitted.push(step),
    )
    chk(emitted.length === 3, `it reports three lookups (${emitted.length})`, `emitted ${emitted.length} steps`)
    chk(
      emitted[0]?.label === "Checking what you're working on",
      'starting with what you are working on',
      `first step was "${emitted[0]?.label}"`,
    )
    chk(
      emitted.some((s) => /item\(s\) on your personal list/.test(s.finding ?? '')),
      'and each one carries what it actually found',
      `no step reported a finding: ${JSON.stringify(emitted)}`,
    )
    chk(
      emitted.find((s) => s.label === 'Checking the skills you already have')?.finding !== undefined,
      'including the skills you already own',
      'the existing-skills lookup reported nothing',
    )
    chk(proposal.steps.length === 3, 'the proposal carries the same steps', `carried ${proposal.steps.length}`)
    chk(
      message.endsWith("Approve this approach and I'll create it, or tell me one tweak you want first."),
      'and it ends on her question',
      `message ended: ...${message.slice(-60)}`,
    )
    chk(
      /no model is configured/i.test(proposal.rationale),
      'saying plainly that no model read the workspace',
      'the keyless draft implied grounding it did not have',
    )
    const countBefore = ((await call('GET', `/workspaces/${WS}/skills?tab=all`)).data ?? []).length
    chk(countBefore === 1, 'and asking wrote nothing', `asking changed the skill count to ${countBefore}`)
  }

  console.log('\n▶ approving a drafted skill — [18:17]-[18:42], frame t1146')
  // The write half of the gate. The proposal round-trips through the browser,
  // so it arrives as untrusted input and must go through the same create path.
  const approved = await call('POST', `/workspaces/${WS}/skills/from-proposal`, {
    name: 'Personal Task Organizer',
    description: 'Captures tasks and clarifies the next action',
    instructions: 'You organise my work.\n\nCapture, clarify, prioritise.',
    memories: ['I plan on Mondays', 'Deadlines matter more than effort'],
    // Not in the DTO — the pipe must strip it rather than let it decide ownership.
    createdById: THEM,
  })
  chk([200,201].includes(approved.status), 'an approved draft becomes a skill', `got ${approved.status}: ${JSON.stringify(approved.data)?.slice(0,160)}`)
  chk(approved.data?.createdById === ME, 'owned by whoever approved it, not by the body', `createdById was ${approved.data?.createdById}`)
  chk(approved.data?.memoriesCreated === 2, 'and its memory arrives with it, in one action', `memoriesCreated was ${approved.data?.memoriesCreated}`)
  const approvedMemories = await call('GET', `/workspaces/${WS}/skills/${approved.data.id}/memories`)
  chk((approvedMemories.data ?? []).length === 2, 'both memories are readable', `got ${(approvedMemories.data ?? []).length}`)
  chk(
    (approvedMemories.data ?? []).every((m) => m.source === 'chat'),
    'marked as coming from a conversation',
    'memories from a proposal were not marked as chat-sourced',
  )
  const draftPrompt = svc.renderSkillPrompt(await svc.buildInvocationContext(WS, ME, approved.data.id))
  chk(draftPrompt.includes('I plan on Mondays'), 'and the approved skill answers knowing them', 'approved memories did not reach the prompt')
  chk(
    (await call('POST', `/workspaces/${WS}/skills/from-proposal`, { name: 'x', instructions: '' })).status === 400,
    'a draft with no instructions is refused',
    'an empty draft was accepted',
  )
  await call('DELETE', `/workspaces/${WS}/skills/${approved.data.id}`)

  console.log('\n▶ templates')
  const titles = ((await call('GET', `/workspaces/${WS}/skills/templates`)).data ?? []).map((x) => x.title)
  chk(['Delegate Like Me','Brand Voice','Triage Tasks Like Me'].every((n) => titles.includes(n)), 'the hub is served her three starter templates', `got ${JSON.stringify(titles)}`)

  console.log('\n▶ cleanup')
  const ownerDelete = await call('DELETE', `/workspaces/${WS}/skills/${skill.id}`)
  chk(ownerDelete.status === 200, 'the owner can delete it', `owner delete returned ${ownerDelete.status}: ${JSON.stringify(ownerDelete.data)?.slice(0,160)}`)
  chk((await call('GET', `/workspaces/${WS}/skills/${skill.id}`)).status === 404, 'and it is gone', 'the skill survived deletion')

  await app.close()
  console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
