/**
 * §15 — the drafting flow against a real model.
 *
 * The unit tests cover parsing and the gate; the HTTP harness covers the write
 * path; neither can see whether the PROMPT is any good. Running this once
 * against a real key found two faults nothing else could: a name that came back
 * as a lowercase echo of the request ("my task organizer"), and follow-up chips
 * written as questions TO the user — which, since a chip is sent verbatim as
 * their next message, would have had them interviewing themselves.
 *
 * Not in CI: it costs a model call and needs a key. Run it after touching the
 * proposer's prompt.
 *
 *   cd apps/api && pnpm build
 *   DATABASE_URL=... ANTHROPIC_API_KEY=... npx tsx test/live-propose.mts
 *
 * Fixtures: test/skills-http-fixtures.sql
 */
import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { DatabaseModule, DB_TOKEN } from '../dist/apps/api/src/common/database/database.module.js'
import { AiService } from '../dist/apps/api/src/modules/ai/ai.service.js'
import { SkillsService } from '../dist/apps/api/src/modules/skills/skills.service.js'

const WS = '11111111-1111-4111-8111-111111111111'
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

let pass = 0
let fail = 0
const chk = (c: boolean, good: string, bad: string) =>
  c
    ? (pass++, console.log(`  \x1b[32mPASS\x1b[0m ${good}`))
    : (fail++, console.log(`  \x1b[31mFAIL\x1b[0m ${bad}`))

class H {}
Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule] })(H)

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('No ANTHROPIC_API_KEY — skipping. This check exists to exercise a real model call.')
    process.exit(0)
  }
  const app = await NestFactory.create(H, new FastifyAdapter({ logger: false }), { logger: false })
  await app.init()
  const db = app.get(DB_TOKEN)
  const config = {
    get: (k: string) => (k === 'ANTHROPIC_API_KEY' ? process.env.ANTHROPIC_API_KEY : undefined),
  }
  const ai = new AiService(config as never, db, {} as never)
  const skills = new SkillsService(db)
  // Rate limiting and usage accounting both write; neither is under test here.
  ;(ai as unknown as { assertWithinRateLimit: () => Promise<void> }).assertWithinRateLimit = async () => {}
  ;(ai as unknown as { recordUsage: () => void }).recordUsage = () => {}

  console.log('\n▶ drafting')
  const emitted: Array<{ label: string; finding?: string }> = []
  const { proposal, message } = await ai.proposeSkill(
    WS,
    ME,
    'create a personal task organizer skill',
    {},
    (s: { label: string; finding?: string }) => emitted.push(s),
  )
  chk(emitted.length === 3, 'three real lookups were reported', `got ${emitted.length}`)
  chk(!!proposal.name && !!proposal.instructions, 'a whole skill came back', 'the draft was incomplete')

  // The lowercase-echo fault. Her frames read "Personal Task Organizer".
  chk(
    proposal.name === proposal.name.trim() && /^[A-Z]/.test(proposal.name),
    `the name is a name, not an echo — "${proposal.name}"`,
    `the name came back as "${proposal.name}"`,
  )
  chk(
    proposal.name.toLowerCase() !== 'my task organizer',
    'and not the literal request back',
    'the name is a lowercase echo of the request',
  )

  // The chip fault. A chip is sent verbatim AS the user, so a question
  // addressed to them would have them interviewing themselves.
  chk(proposal.followUps.length > 0, `${proposal.followUps.length} follow-up chip(s)`, 'no follow-ups')
  const interrogative = proposal.followUps.filter((f: string) =>
    /\?$/.test(f.trim()) || /^(what|would you|do you|which|how would you)\b/i.test(f.trim()),
  )
  chk(
    interrogative.length === 0,
    'each written in the user’s voice, as something to send',
    `these are questions addressed to the user: ${JSON.stringify(interrogative)}`,
  )

  chk(
    proposal.rationale.length > 0 && !/no model is configured/i.test(proposal.rationale),
    `grounded in what it read — "${proposal.rationale.slice(0, 70)}…"`,
    'the rationale fell back to the keyless wording despite a key',
  )
  chk(
    message.endsWith("Approve this approach and I'll create it, or tell me one tweak you want first."),
    'ending on her question',
    `ended: …${message.slice(-70)}`,
  )

  console.log('\n▶ approving')
  const before = await skills.list(WS, ME, 'all')
  const created = await skills.createFromProposal(WS, ME, {
    name: `${proposal.name} ${Date.now()}`,
    description: proposal.description,
    instructions: proposal.instructions,
    memories: proposal.memories,
  })
  chk(!!created.id, 'the approved draft became a skill', 'approving did not create anything')
  chk(
    created.memoriesCreated === proposal.memories.length,
    `with all ${proposal.memories.length} of its memories`,
    `expected ${proposal.memories.length}, got ${created.memoriesCreated}`,
  )
  chk((await skills.list(WS, ME, 'all')).length === before.length + 1, 'exactly one new skill', 'the count moved by the wrong amount')

  console.log('\n▶ using it')
  const prompt = skills.renderSkillPrompt(await skills.buildInvocationContext(WS, ME, created.id))
  chk(prompt.includes(created.name), 'the skill answers as itself', 'the name did not reach the prompt')
  chk(
    proposal.memories.every((m: string) => prompt.includes(m)),
    'knowing everything it was approved with',
    'a memory did not reach the prompt',
  )
  chk(prompt.includes('do not take actions on your own'), 'and the boundary is the last word', 'the boundary is missing')

  await skills.remove(WS, ME, created.id)
  chk((await skills.list(WS, ME, 'all')).length === before.length, 'cleaned up after itself', 'the skill survived')

  await app.close()
  console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('FAILED:', e?.message ?? e)
  process.exit(1)
})
