import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  APPROVAL_PROMPT,
  fallbackProposal,
  noPatternsFound,
  parseMinedSkills,
  parseSkillProposal,
  renderProposal,
} from './skill-proposal'

/**
 * §15 — the mechanism she actually demonstrates, `[18:17]–[18:42]`.
 *
 *   "main is ko sab cheezein batati jaoongi… phir woh meri poori ki poori SKILL
 *    create karega… main yahan pe likhoongi: 'create a personal task organizer
 *    skill', to yeh poori ki poori skill ban jayegi."
 *
 * The starter cards are what she calls EXAMPLES [18:03]. This is how a skill
 * gets made, and the thing that makes it safe to make from someone's real data
 * is that it stops and asks first (frame `t1146`).
 */

const GOOD = {
  name: 'Personal Task Organizer',
  description: 'Captures tasks and clarifies the next action',
  instructions: 'You organise my work.\n\nCapture, clarify, prioritise.',
  memories: ['I plan on Mondays', 'I plan on Mondays', 'Deadlines matter more than effort'],
  rationale: 'I found a mostly empty personal list, so I would keep this simple.',
  followUps: ['Add weekly review', 'Tell it who to involve', 'Find my recurring workflows'],
}

describe('§15 parsing a drafted skill', () => {
  it('keeps the fields that make a skill a skill', () => {
    const p = parseSkillProposal(GOOD)
    assert.equal(p?.name, 'Personal Task Organizer')
    assert.match(p!.instructions, /You organise my work\./)
    assert.equal(p?.rationale, 'I found a mostly empty personal list, so I would keep this simple.')
  })

  it('refuses a draft with no name or no instructions', () => {
    // A skill with neither would be created, listed, and do nothing — worse
    // than saying it could not be drafted, because it looks like it worked.
    assert.equal(parseSkillProposal({ ...GOOD, name: '   ' }), null)
    assert.equal(parseSkillProposal({ ...GOOD, instructions: '' }), null)
    assert.equal(parseSkillProposal({ ...GOOD, instructions: undefined }), null)
  })

  it('reads JSON out of a fenced block or surrounding prose', () => {
    const fenced = '```json\n' + JSON.stringify(GOOD) + '\n```'
    assert.equal(parseSkillProposal(fenced)?.name, GOOD.name)
    const chatty = `Here is the skill:\n${JSON.stringify(GOOD)}\nHope that helps!`
    assert.equal(parseSkillProposal(chatty)?.name, GOOD.name)
  })

  it('returns null on unparseable output rather than guessing', () => {
    assert.equal(parseSkillProposal('I could not do that'), null)
    assert.equal(parseSkillProposal(null), null)
    assert.equal(parseSkillProposal(42), null)
  })

  it('de-duplicates memories and bounds every list', () => {
    const p = parseSkillProposal(GOOD)
    assert.deepEqual(p?.memories, ['I plan on Mondays', 'Deadlines matter more than effort'])

    const flood = parseSkillProposal({
      ...GOOD,
      memories: Array.from({ length: 40 }, (_v, i) => `fact ${i}`),
      followUps: Array.from({ length: 20 }, (_v, i) => `ask ${i}`),
    })
    assert.equal(flood?.memories.length, 8)
    assert.equal(flood?.followUps.length, 3)
  })

  it('clamps a runaway field instead of storing it', () => {
    const p = parseSkillProposal({ ...GOOD, name: 'x'.repeat(500) })
    assert.equal(p?.name.length, 80)
  })

  it('ignores non-string junk inside the arrays', () => {
    const p = parseSkillProposal({ ...GOOD, memories: [{ evil: true }, null, 'real fact'] })
    assert.deepEqual(p?.memories, ['real fact'])
  })

  it('carries the steps through untouched', () => {
    const steps = [{ label: 'Mapping your task habits', finding: '0 item(s)' }]
    assert.deepEqual(parseSkillProposal(GOOD, steps)?.steps, steps)
  })
})

describe('§15 the approval gate', () => {
  it('ends on her question, every time', () => {
    // Frame t1146, bolded on screen: this sentence is the gate. A proposal
    // rendered without it reads as a report of something already done.
    assert.ok(renderProposal(parseSkillProposal(GOOD)!).endsWith(APPROVAL_PROMPT))
    assert.ok(renderProposal(fallbackProposal('organise my tasks')).endsWith(APPROVAL_PROMPT))
  })

  it('leads with the reason, because that is what is being approved', () => {
    const rendered = renderProposal(parseSkillProposal(GOOD)!)
    assert.ok(
      rendered.startsWith('I found a mostly empty personal list'),
      `rationale did not lead:\n${rendered.slice(0, 120)}`,
    )
  })

  it('says what the skill would already know', () => {
    assert.match(renderProposal(parseSkillProposal(GOOD)!), /I plan on Mondays/)
  })
})

describe('§15 no model configured', () => {
  it('still drafts a real, usable skill from the request', () => {
    const p = fallbackProposal('create a personal task organizer skill')
    assert.equal(p.name, 'Personal Task Organizer')
    assert.match(p.instructions, /Personal Task Organizer/)
    assert.ok(p.followUps.length > 0)
  })

  it('says plainly that it read nothing, rather than implying grounding', () => {
    // The alternative — a confident rationale with no lookup behind it — is
    // the one failure here that nobody could detect from the outside.
    const p = fallbackProposal('triage my inbox')
    assert.match(p.rationale, /no model is configured/i)
    assert.match(p.rationale, /nothing about your workspace was read/i)
    assert.deepEqual(p.memories, [])
  })

  it('falls back to a name rather than an empty one', () => {
    assert.equal(fallbackProposal('   ').name, 'New Skill')
    assert.equal(fallbackProposal('skill').name, 'New Skill')
  })
})


describe('§15 Skills Miner — "surface workflows worth saving"', () => {
  const mined = (over: Record<string, unknown> = {}) => ({
    name: 'Weekly Client Update',
    description: 'Writes the Friday client note',
    instructions: 'You write my Friday client update.',
    memories: ['Clients want progress first, blockers second'],
    rationale: 'You created a client update task every Friday for eight weeks.',
    evidence: ['Client update — week 12', 'Client update — week 13', 'Client update — week 14'],
    followUps: ['Draft this week from my open tasks'],
    ...over,
  })

  it('reads a list, or a { skills: [...] } wrapper', () => {
    assert.equal(parseMinedSkills([mined()]).length, 1)
    assert.equal(parseMinedSkills({ skills: [mined()] }).length, 1)
    assert.equal(parseMinedSkills(JSON.stringify([mined()])).length, 1)
  })

  it('keeps the evidence verbatim, because that is the claim', () => {
    // The card says "we scanned your work and found this". The lines are what
    // let someone check that, so they travel with the proposal.
    const [skill] = parseMinedSkills([mined()])
    assert.deepEqual(skill.evidence, [
      'Client update — week 12',
      'Client update — week 13',
      'Client update — week 14',
    ])
  })

  it('drops a suggestion with no evidence', () => {
    // Otherwise it is a guess wearing a miner's hat: presented as something
    // found in your work, with nothing behind it.
    assert.equal(parseMinedSkills([mined({ evidence: [] })]).length, 0)
    assert.equal(parseMinedSkills([mined({ evidence: undefined })]).length, 0)
  })

  it('drops a suggestion that would create an empty skill', () => {
    assert.equal(parseMinedSkills([mined({ instructions: '' })]).length, 0)
    assert.equal(parseMinedSkills([mined({ name: '  ' })]).length, 0)
  })

  it('keeps the good ones when one in the batch is broken', () => {
    const out = parseMinedSkills([mined({ instructions: '' }), mined({ name: 'Sprint Recap' })])
    assert.equal(out.length, 1)
    assert.equal(out[0].name, 'Sprint Recap')
  })

  it('is bounded — five skills, six lines of evidence each', () => {
    const many = Array.from({ length: 12 }, (_v, i) => mined({ name: `Skill ${i}` }))
    assert.equal(parseMinedSkills(many).length, 5)
    const wordy = parseMinedSkills([
      mined({ evidence: Array.from({ length: 20 }, (_v, i) => `line ${i}`) }),
    ])
    assert.equal(wordy[0].evidence.length, 6)
  })

  it('returns nothing rather than throwing on junk', () => {
    assert.deepEqual(parseMinedSkills('not json'), [])
    assert.deepEqual(parseMinedSkills(null), [])
    assert.deepEqual(parseMinedSkills({ skills: 'nope' }), [])
  })

  it('says what it read when it found nothing', () => {
    // "No results" and "the button is broken" look identical unless the empty
    // answer says what it looked at.
    const message = noPatternsFound([
      { label: 'Reading the tasks you set up', finding: '3 in the last 90 days' },
      { label: 'Reading the docs you wrote', finding: '0' },
    ])
    assert.match(message, /3 in the last 90 days/)
    assert.match(message, /did not find a workflow repeated often enough/)
  })
})
