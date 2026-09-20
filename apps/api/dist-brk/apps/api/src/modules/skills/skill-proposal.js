"use strict";
/**
 * §15 — the AI authoring a skill for you, `[18:17]–[18:42]`.
 *
 *   "main is ko sab cheezein batati jaoongi… Pehle to woh apna [data sketch] out
 *    karega jo main kaam kar rahi hoon… phir woh meri poori ki poori SKILL
 *    create karega… main yahan pe likhoongi: 'create a personal task organizer
 *    skill', to yeh poori ki poori skill ban jayegi."
 *
 * The starter cards on the hub are what she calls EXAMPLES `[18:03]`. This is
 * the mechanism: you ask in words, it looks at what you actually do, and it
 * drafts the whole skill — then stops and asks before writing anything.
 *
 * Everything here is pure and DB-free, like `ai-command.ts` next door, so the
 * shape of a proposal can be tested without a live model. The two halves that
 * matter are both in this file: nothing is written until `approved` is true,
 * and a proposal that cannot be parsed becomes null rather than a half-skill.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.APPROVAL_PROMPT = void 0;
exports.parseSkillProposal = parseSkillProposal;
exports.renderProposal = renderProposal;
exports.fallbackProposal = fallbackProposal;
exports.parseMinedSkills = parseMinedSkills;
exports.noPatternsFound = noPatternsFound;
/** The approval gate's wording, from frame `t1146`. */
exports.APPROVAL_PROMPT = "Approve this approach and I'll create it, or tell me one tweak you want first.";
const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;
const MAX_INSTRUCTIONS = 20_000;
const MAX_MEMORY = 4_000;
const MAX_MEMORIES = 8;
const MAX_FOLLOW_UPS = 3;
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const clamp = (v, n) => (v.length > n ? v.slice(0, n).trimEnd() : v);
function strings(v, max, cap) {
    if (!Array.isArray(v))
        return [];
    const out = [];
    for (const item of v) {
        const s = clamp(str(item), cap);
        if (s && !out.includes(s))
            out.push(s);
        if (out.length >= max)
            break;
    }
    return out;
}
/**
 * Turn whatever the model returned into a proposal, or nothing.
 *
 * Deliberately strict about the two fields that make a skill a skill: a name
 * and instructions. A proposal missing either would create a skill that does
 * nothing, which is worse than saying it could not be drafted — and this is
 * the last checkpoint before a person is shown something to approve.
 */
function parseSkillProposal(raw, steps = []) {
    const source = typeof raw === 'string' ? safeJson(raw) : raw;
    if (!source || typeof source !== 'object')
        return null;
    const o = source;
    const name = clamp(str(o.name), MAX_NAME);
    const instructions = clamp(str(o.instructions), MAX_INSTRUCTIONS);
    if (!name || !instructions)
        return null;
    return {
        name,
        description: clamp(str(o.description), MAX_DESCRIPTION),
        instructions,
        memories: strings(o.memories, MAX_MEMORIES, MAX_MEMORY),
        rationale: clamp(str(o.rationale), MAX_DESCRIPTION * 4),
        steps,
        followUps: strings(o.followUps, MAX_FOLLOW_UPS, 120),
    };
}
/**
 * Models wrap JSON in prose or a fenced block often enough that refusing those
 * would mean refusing good proposals. Anything else is a parse failure, which
 * is the honest outcome.
 */
function safeJson(text) {
    const trimmed = text.trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
    const candidate = fenced ? fenced[1] : trimmed;
    try {
        return JSON.parse(candidate);
    }
    catch {
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start === -1 || end <= start)
            return null;
        try {
            return JSON.parse(candidate.slice(start, end + 1));
        }
        catch {
            return null;
        }
    }
}
/**
 * What a person is shown before deciding, ending in her exact question.
 *
 * The rationale leads because that is what makes the proposal answerable: at
 * `[18:58]` the reason ("I found a mostly empty personal list") is what tells
 * her whether the design is right, not the list of capabilities.
 */
function renderProposal(proposal) {
    const parts = [];
    if (proposal.rationale)
        parts.push(proposal.rationale);
    parts.push(`**${proposal.name}** — ${proposal.description || 'a reusable playbook.'}`);
    if (proposal.memories.length > 0) {
        parts.push(`It would start out knowing: ${proposal.memories.map((m) => m.replace(/\.$/, '')).join('; ')}.`);
    }
    parts.push(exports.APPROVAL_PROMPT);
    return parts.join('\n\n');
}
/**
 * The deterministic draft used when no model is configured.
 *
 * Not a placeholder: an instance without `ANTHROPIC_API_KEY` still gets a real,
 * usable skill from a real request, and the steps say plainly that it was
 * drafted from the request rather than from the workspace — so nobody is shown
 * grounding that did not happen.
 */
function fallbackProposal(request, steps = []) {
    const cleaned = request
        .replace(/^\s*(please\s+)?(help me\s+)?(create|make|build|draft)\s+(me\s+)?(an?\s+)?/i, '')
        .replace(/\bskill\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    const name = clamp(titleCase(cleaned) || 'New Skill', MAX_NAME);
    return {
        name,
        description: `Handles ${cleaned || 'this work'} the way you would.`,
        instructions: [
            `You are the "${name}" skill.`,
            '',
            `When asked, handle ${cleaned || 'this work'} the way I would: follow the steps I`,
            'have described, say what you are basing each call on, and ask rather than guess',
            'when something is genuinely ambiguous.',
        ].join('\n'),
        memories: [],
        rationale: 'Drafted from your request alone — no model is configured on this instance, so ' +
            'nothing about your workspace was read. Edit the instructions once it exists.',
        steps,
        followUps: [
            `Add what "done" looks like to ${name}`,
            `Tell ${name} who to involve`,
            'Find my recurring workflows and recommend the best skill',
        ],
    };
}
function titleCase(value) {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
const MAX_MINED = 5;
const MAX_EVIDENCE = 6;
/**
 * Parse a mining run into proposals.
 *
 * Each one goes through `parseSkillProposal`, so a suggestion missing a name or
 * instructions is dropped rather than surfacing as an approvable card that
 * would create an empty skill. Returning fewer is the honest outcome; returning
 * a broken one is not.
 */
function parseMinedSkills(raw, steps = []) {
    const source = typeof raw === 'string' ? safeJson(raw) : raw;
    const list = Array.isArray(source)
        ? source
        : Array.isArray(source?.skills)
            ? (source.skills)
            : [];
    const out = [];
    for (const item of list) {
        const proposal = parseSkillProposal(item, steps);
        if (!proposal)
            continue;
        const evidence = strings(item?.evidence, MAX_EVIDENCE, 200);
        // A proposal with no evidence is a guess wearing a miner's hat: the card
        // says "we scanned your work and found this", and without the lines that
        // suggested it there is nothing to check that claim against.
        if (evidence.length === 0)
            continue;
        out.push({ ...proposal, evidence });
        if (out.length >= MAX_MINED)
            break;
    }
    return out;
}
/**
 * What the miner says when it found nothing.
 *
 * Deliberately not an error and not an empty list with no explanation: a person
 * who clicks "Find my Skills" on a quiet workspace should be told that it read
 * their work and there was not enough repetition yet, which is a different
 * thing from the button being broken.
 */
function noPatternsFound(scanned) {
    const counts = scanned
        .map((s) => s.finding)
        .filter(Boolean)
        .join(', ');
    return counts
        ? `I read ${counts} and did not find a workflow repeated often enough to be worth saving yet. Skills earn their keep on work you do again and again — come back once a pattern has had time to form, or write one from scratch.`
        : 'There was not enough here to read yet.';
}
//# sourceMappingURL=skill-proposal.js.map