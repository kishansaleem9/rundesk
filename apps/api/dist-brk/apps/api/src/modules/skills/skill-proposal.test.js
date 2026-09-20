"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const skill_proposal_1 = require("./skill-proposal");
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
};
(0, node_test_1.describe)('§15 parsing a drafted skill', () => {
    (0, node_test_1.it)('keeps the fields that make a skill a skill', () => {
        const p = (0, skill_proposal_1.parseSkillProposal)(GOOD);
        strict_1.default.equal(p?.name, 'Personal Task Organizer');
        strict_1.default.match(p.instructions, /You organise my work\./);
        strict_1.default.equal(p?.rationale, 'I found a mostly empty personal list, so I would keep this simple.');
    });
    (0, node_test_1.it)('refuses a draft with no name or no instructions', () => {
        // A skill with neither would be created, listed, and do nothing — worse
        // than saying it could not be drafted, because it looks like it worked.
        strict_1.default.equal((0, skill_proposal_1.parseSkillProposal)({ ...GOOD, name: '   ' }), null);
        strict_1.default.equal((0, skill_proposal_1.parseSkillProposal)({ ...GOOD, instructions: '' }), null);
        strict_1.default.equal((0, skill_proposal_1.parseSkillProposal)({ ...GOOD, instructions: undefined }), null);
    });
    (0, node_test_1.it)('reads JSON out of a fenced block or surrounding prose', () => {
        const fenced = '```json\n' + JSON.stringify(GOOD) + '\n```';
        strict_1.default.equal((0, skill_proposal_1.parseSkillProposal)(fenced)?.name, GOOD.name);
        const chatty = `Here is the skill:\n${JSON.stringify(GOOD)}\nHope that helps!`;
        strict_1.default.equal((0, skill_proposal_1.parseSkillProposal)(chatty)?.name, GOOD.name);
    });
    (0, node_test_1.it)('returns null on unparseable output rather than guessing', () => {
        strict_1.default.equal((0, skill_proposal_1.parseSkillProposal)('I could not do that'), null);
        strict_1.default.equal((0, skill_proposal_1.parseSkillProposal)(null), null);
        strict_1.default.equal((0, skill_proposal_1.parseSkillProposal)(42), null);
    });
    (0, node_test_1.it)('de-duplicates memories and bounds every list', () => {
        const p = (0, skill_proposal_1.parseSkillProposal)(GOOD);
        strict_1.default.deepEqual(p?.memories, ['I plan on Mondays', 'Deadlines matter more than effort']);
        const flood = (0, skill_proposal_1.parseSkillProposal)({
            ...GOOD,
            memories: Array.from({ length: 40 }, (_v, i) => `fact ${i}`),
            followUps: Array.from({ length: 20 }, (_v, i) => `ask ${i}`),
        });
        strict_1.default.equal(flood?.memories.length, 8);
        strict_1.default.equal(flood?.followUps.length, 3);
    });
    (0, node_test_1.it)('clamps a runaway field instead of storing it', () => {
        const p = (0, skill_proposal_1.parseSkillProposal)({ ...GOOD, name: 'x'.repeat(500) });
        strict_1.default.equal(p?.name.length, 80);
    });
    (0, node_test_1.it)('ignores non-string junk inside the arrays', () => {
        const p = (0, skill_proposal_1.parseSkillProposal)({ ...GOOD, memories: [{ evil: true }, null, 'real fact'] });
        strict_1.default.deepEqual(p?.memories, ['real fact']);
    });
    (0, node_test_1.it)('carries the steps through untouched', () => {
        const steps = [{ label: 'Mapping your task habits', finding: '0 item(s)' }];
        strict_1.default.deepEqual((0, skill_proposal_1.parseSkillProposal)(GOOD, steps)?.steps, steps);
    });
});
(0, node_test_1.describe)('§15 the approval gate', () => {
    (0, node_test_1.it)('ends on her question, every time', () => {
        // Frame t1146, bolded on screen: this sentence is the gate. A proposal
        // rendered without it reads as a report of something already done.
        strict_1.default.ok((0, skill_proposal_1.renderProposal)((0, skill_proposal_1.parseSkillProposal)(GOOD)).endsWith(skill_proposal_1.APPROVAL_PROMPT));
        strict_1.default.ok((0, skill_proposal_1.renderProposal)((0, skill_proposal_1.fallbackProposal)('organise my tasks')).endsWith(skill_proposal_1.APPROVAL_PROMPT));
    });
    (0, node_test_1.it)('leads with the reason, because that is what is being approved', () => {
        const rendered = (0, skill_proposal_1.renderProposal)((0, skill_proposal_1.parseSkillProposal)(GOOD));
        strict_1.default.ok(rendered.startsWith('I found a mostly empty personal list'), `rationale did not lead:\n${rendered.slice(0, 120)}`);
    });
    (0, node_test_1.it)('says what the skill would already know', () => {
        strict_1.default.match((0, skill_proposal_1.renderProposal)((0, skill_proposal_1.parseSkillProposal)(GOOD)), /I plan on Mondays/);
    });
});
(0, node_test_1.describe)('§15 no model configured', () => {
    (0, node_test_1.it)('still drafts a real, usable skill from the request', () => {
        const p = (0, skill_proposal_1.fallbackProposal)('create a personal task organizer skill');
        strict_1.default.equal(p.name, 'Personal Task Organizer');
        strict_1.default.match(p.instructions, /Personal Task Organizer/);
        strict_1.default.ok(p.followUps.length > 0);
    });
    (0, node_test_1.it)('says plainly that it read nothing, rather than implying grounding', () => {
        // The alternative — a confident rationale with no lookup behind it — is
        // the one failure here that nobody could detect from the outside.
        const p = (0, skill_proposal_1.fallbackProposal)('triage my inbox');
        strict_1.default.match(p.rationale, /no model is configured/i);
        strict_1.default.match(p.rationale, /nothing about your workspace was read/i);
        strict_1.default.deepEqual(p.memories, []);
    });
    (0, node_test_1.it)('falls back to a name rather than an empty one', () => {
        strict_1.default.equal((0, skill_proposal_1.fallbackProposal)('   ').name, 'New Skill');
        strict_1.default.equal((0, skill_proposal_1.fallbackProposal)('skill').name, 'New Skill');
    });
});
(0, node_test_1.describe)('§15 Skills Miner — "surface workflows worth saving"', () => {
    const mined = (over = {}) => ({
        name: 'Weekly Client Update',
        description: 'Writes the Friday client note',
        instructions: 'You write my Friday client update.',
        memories: ['Clients want progress first, blockers second'],
        rationale: 'You created a client update task every Friday for eight weeks.',
        evidence: ['Client update — week 12', 'Client update — week 13', 'Client update — week 14'],
        followUps: ['Draft this week from my open tasks'],
        ...over,
    });
    (0, node_test_1.it)('reads a list, or a { skills: [...] } wrapper', () => {
        strict_1.default.equal((0, skill_proposal_1.parseMinedSkills)([mined()]).length, 1);
        strict_1.default.equal((0, skill_proposal_1.parseMinedSkills)({ skills: [mined()] }).length, 1);
        strict_1.default.equal((0, skill_proposal_1.parseMinedSkills)(JSON.stringify([mined()])).length, 1);
    });
    (0, node_test_1.it)('keeps the evidence verbatim, because that is the claim', () => {
        // The card says "we scanned your work and found this". The lines are what
        // let someone check that, so they travel with the proposal.
        const [skill] = (0, skill_proposal_1.parseMinedSkills)([mined()]);
        strict_1.default.deepEqual(skill.evidence, [
            'Client update — week 12',
            'Client update — week 13',
            'Client update — week 14',
        ]);
    });
    (0, node_test_1.it)('drops a suggestion with no evidence', () => {
        // Otherwise it is a guess wearing a miner's hat: presented as something
        // found in your work, with nothing behind it.
        strict_1.default.equal((0, skill_proposal_1.parseMinedSkills)([mined({ evidence: [] })]).length, 0);
        strict_1.default.equal((0, skill_proposal_1.parseMinedSkills)([mined({ evidence: undefined })]).length, 0);
    });
    (0, node_test_1.it)('drops a suggestion that would create an empty skill', () => {
        strict_1.default.equal((0, skill_proposal_1.parseMinedSkills)([mined({ instructions: '' })]).length, 0);
        strict_1.default.equal((0, skill_proposal_1.parseMinedSkills)([mined({ name: '  ' })]).length, 0);
    });
    (0, node_test_1.it)('keeps the good ones when one in the batch is broken', () => {
        const out = (0, skill_proposal_1.parseMinedSkills)([mined({ instructions: '' }), mined({ name: 'Sprint Recap' })]);
        strict_1.default.equal(out.length, 1);
        strict_1.default.equal(out[0].name, 'Sprint Recap');
    });
    (0, node_test_1.it)('is bounded — five skills, six lines of evidence each', () => {
        const many = Array.from({ length: 12 }, (_v, i) => mined({ name: `Skill ${i}` }));
        strict_1.default.equal((0, skill_proposal_1.parseMinedSkills)(many).length, 5);
        const wordy = (0, skill_proposal_1.parseMinedSkills)([
            mined({ evidence: Array.from({ length: 20 }, (_v, i) => `line ${i}`) }),
        ]);
        strict_1.default.equal(wordy[0].evidence.length, 6);
    });
    (0, node_test_1.it)('returns nothing rather than throwing on junk', () => {
        strict_1.default.deepEqual((0, skill_proposal_1.parseMinedSkills)('not json'), []);
        strict_1.default.deepEqual((0, skill_proposal_1.parseMinedSkills)(null), []);
        strict_1.default.deepEqual((0, skill_proposal_1.parseMinedSkills)({ skills: 'nope' }), []);
    });
    (0, node_test_1.it)('says what it read when it found nothing', () => {
        // "No results" and "the button is broken" look identical unless the empty
        // answer says what it looked at.
        const message = (0, skill_proposal_1.noPatternsFound)([
            { label: 'Reading the tasks you set up', finding: '3 in the last 90 days' },
            { label: 'Reading the docs you wrote', finding: '0' },
        ]);
        strict_1.default.match(message, /3 in the last 90 days/);
        strict_1.default.match(message, /did not find a workflow repeated often enough/);
    });
});
//# sourceMappingURL=skill-proposal.test.js.map